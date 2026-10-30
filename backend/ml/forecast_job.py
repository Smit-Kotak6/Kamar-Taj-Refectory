"""
GOAL 9 - Demand forecasting job (reads history from PostgreSQL, writes forecasts back).

Run from backend/:
    python ml/forecast_job.py --seed-synthetic     # first time: fill demo history, then forecast
    python ml/forecast_job.py                      # later: retrain + refresh forecasts

Needs:  pip install pandas numpy scikit-learn psycopg2-binary python-dotenv
Reads DATABASE_URL from backend/.env (same one Prisma uses).

What it predicts: attendance RATE (consumed / booked) per meal, then
    expected meals = booked * predicted rate
Forecasts are advisory only; they never cancel bookings (spec section 14).
"""
import os
import sys
import argparse
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

load_dotenv()
MEALS = ["BREAKFAST", "LUNCH", "DINNER"]
FEATURES = ["dow", "is_weekend", "meal_code", "booked", "rate_lag_7", "rate_roll_14"]


# --------------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------------
def connect():
    url = os.environ["DATABASE_URL"].split("?")[0]  # drop Prisma-only query params
    return psycopg2.connect(url)


def load_stats(cur) -> pd.DataFrame:
    cur.execute('SELECT "date", "mealType"::text, "booked", "consumed" FROM "DailyMealStat" ORDER BY "date"')
    df = pd.DataFrame(cur.fetchall(), columns=["date", "meal", "booked", "consumed"])
    df["date"] = pd.to_datetime(df["date"])
    return df


def seed_synthetic(cur, days: int = 180):
    """Demo history. Clearly marked source='SYNTHETIC' so it is never mistaken for real data."""
    cur.execute('SELECT COUNT(*) FROM "DailyMealStat"')
    if cur.fetchone()[0] > 0:
        print("DailyMealStat already has data - not seeding.")
        return
    rng = np.random.default_rng(42)
    end = pd.Timestamp.today().normalize() - pd.Timedelta(days=1)
    rows = []
    for d in pd.date_range(end=end, periods=days):
        for meal in MEALS:
            booked = int(rng.normal(1500, 20))
            rate = {"BREAKFAST": 0.62, "LUNCH": 0.90, "DINNER": 0.86}[meal]
            if d.dayofweek == 6 and meal == "BREAKFAST":
                rate -= 0.12
            if d.dayofweek in (4, 5) and meal == "DINNER":
                rate -= 0.08
            if d.dayofweek == 0 and meal == "BREAKFAST":
                rate -= 0.05
            rate = float(np.clip(rate + rng.normal(0, 0.02), 0.3, 0.99))
            rows.append((d.date(), meal, booked, int(booked * rate), "SYNTHETIC"))
    execute_values(
        cur,
        'INSERT INTO "DailyMealStat" ("date","mealType","booked","consumed","source") VALUES %s ON CONFLICT DO NOTHING',
        rows,
        template='(%s, %s::"MealType", %s, %s, %s)',
    )
    print(f"Seeded {len(rows)} synthetic history rows ({days} days x 3 meals).")


def save_forecasts(cur, rows):
    execute_values(
        cur,
        'INSERT INTO "MealForecast" ("date","mealType","booked","expected","low","high","predictedRate","modelInfo") VALUES %s '
        'ON CONFLICT ("date","mealType") DO UPDATE SET "booked"=EXCLUDED."booked", "expected"=EXCLUDED."expected", '
        '"low"=EXCLUDED."low", "high"=EXCLUDED."high", "predictedRate"=EXCLUDED."predictedRate", '
        '"modelInfo"=EXCLUDED."modelInfo", "createdAt"=now()',
        rows,
        template='(%s, %s::"MealType", %s, %s, %s, %s, %s, %s)',
    )


# Later, when real data exists, a nightly job can aggregate it like this (not run now):
#   INSERT INTO "DailyMealStat" ("date","mealType","booked","consumed","source")
#   SELECT "mealDate","mealType",
#          COUNT(*) FILTER (WHERE status IN ('BOOKED','REDEEMED')),
#          COUNT(*) FILTER (WHERE status = 'REDEEMED'), 'REAL'
#   FROM "Booking" WHERE "mealDate" < CURRENT_DATE GROUP BY 1,2
#   ON CONFLICT ("date","mealType") DO UPDATE SET booked=EXCLUDED.booked,
#          consumed=EXCLUDED.consumed, source='REAL';


# --------------------------------------------------------------------------
# Features, training, evaluation
# --------------------------------------------------------------------------
def add_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["meal", "date"]).copy()
    df["rate"] = df["consumed"] / df["booked"]
    df["dow"] = df["date"].dt.dayofweek
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["meal_code"] = df["meal"].map({m: i for i, m in enumerate(MEALS)})
    g = df.groupby("meal")["rate"]
    df["rate_lag_7"] = g.shift(7)  # same weekday last week (past data only)
    df["rate_roll_14"] = g.transform(lambda s: s.shift(1).rolling(14).mean())
    return df.dropna()


def new_model():
    return GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, random_state=0)


def train_and_evaluate(raw: pd.DataFrame):
    data = add_features(raw)
    cutoff = data["date"].max() - pd.Timedelta(days=30)  # train on the past, test on the last 30 days
    train, test = data[data["date"] <= cutoff], data[data["date"] > cutoff]

    model = new_model().fit(train[FEATURES], train["rate"])
    booked = test["booked"].values
    actual = test["consumed"].values
    pred = model.predict(test[FEATURES]) * booked
    baseline = test["rate_roll_14"].values * booked

    mae = {
        "ML model": mean_absolute_error(actual, pred),
        "14-day average": mean_absolute_error(actual, baseline),
        "Assume all booked eat": mean_absolute_error(actual, booked),
    }
    # Uncertainty band from how wrong the model really was on unseen days (10th-90th percentile)
    resid = (actual - pred) / np.maximum(pred, 1)
    band = (float(np.quantile(resid, 0.1)), float(np.quantile(resid, 0.9)))

    final = new_model().fit(data[FEATURES], data["rate"])  # refit on all data for real forecasts
    return final, band, mae


# --------------------------------------------------------------------------
# Forecasting the next days
# --------------------------------------------------------------------------
def forecast_days(model, raw: pd.DataFrame, band, days: int, info: str):
    hist = raw[["date", "meal", "booked", "consumed"]].copy()
    booked_by_meal = {  # default booking => booked ~ active members; use the recent average as stand-in
        m: int(round(hist[hist["meal"] == m].sort_values("date").tail(7)["booked"].mean())) for m in MEALS
    }
    last = hist["date"].max()
    out = []
    for k in range(1, days + 1):
        d = last + pd.Timedelta(days=k)
        for meal in MEALS:
            h = hist[hist["meal"] == meal].sort_values("date")
            roll14 = float((h["consumed"] / h["booked"]).tail(14).mean())
            same = h[h["date"] == d - pd.Timedelta(days=7)]
            lag7 = float((same["consumed"] / same["booked"]).mean()) if len(same) else roll14
            booked = booked_by_meal[meal]
            row = pd.DataFrame([{
                "dow": d.dayofweek, "is_weekend": int(d.dayofweek >= 5), "meal_code": MEALS.index(meal),
                "booked": booked, "rate_lag_7": lag7, "rate_roll_14": roll14,
            }])
            rate = float(np.clip(model.predict(row[FEATURES])[0], 0, 1))
            exp = int(round(rate * booked))
            lo = int(max(0, round(exp * (1 + band[0]))))
            hi = int(min(booked, round(exp * (1 + band[1]))))
            out.append((d.date(), meal, booked, exp, lo, hi, round(rate, 4), info))
            # feed the prediction back so day+2, day+3 can use it as history
            hist = pd.concat([hist, pd.DataFrame([{"date": d, "meal": meal, "booked": booked, "consumed": exp}])])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-synthetic", action="store_true", help="fill demo history if the table is empty")
    ap.add_argument("--days", type=int, default=3, help="how many days ahead to forecast")
    a = ap.parse_args()

    conn = connect()
    cur = conn.cursor()
    if a.seed_synthetic:
        seed_synthetic(cur)
        conn.commit()

    raw = load_stats(cur)
    if raw["date"].nunique() < 60:
        sys.exit("Need at least 60 days of history in DailyMealStat. Run with --seed-synthetic for demo data.")

    model, band, mae = train_and_evaluate(raw)
    print("\nMean absolute error in meals, last 30 days held out:")
    for name, v in mae.items():
        print(f"  {name:<22}: {v:7.1f}")
    print(f"Uncertainty band (10th-90th pct of past error): {band[0]:+.1%} to {band[1]:+.1%}")

    info = f"GradientBoosting; holdout MAE {mae['ML model']:.1f} vs 14-day avg {mae['14-day average']:.1f}"
    rows = forecast_days(model, raw, band, a.days, info)
    save_forecasts(cur, rows)
    conn.commit()

    print("\nSaved forecasts (advisory only):")
    for d, meal, booked, exp, lo, hi, rate, _ in rows:
        print(f"  {d}  {meal:<9} booked~{booked}  expected {exp}  (range {lo}-{hi})  rate {rate:.1%}")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
