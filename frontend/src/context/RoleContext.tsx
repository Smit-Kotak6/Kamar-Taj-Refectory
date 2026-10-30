import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { http, getToken, setToken } from '../api/http'
import { ROLE_CONFIG, type Role, type RoleConfig } from '../config/navigation'
type Account = { id: string; name: string; email: string; role: 'STUDENT'|'STAFF'|'ADMIN'|'SUPER_ADMIN' }
interface Context { role: Role; config: RoleConfig; user: {name:string;subtitle:string;initials:string}; account: Account|null; status:'loading'|'signed-in'|'signed-out'; login:(email:string,password:string)=>Promise<Account>; signup:(name:string,email:string,password:string)=>Promise<void>; logout:()=>Promise<void> }
const RoleContext = createContext<Context|null>(null)
// eslint-disable-next-line react-refresh/only-export-components
export function homeFor(role: Account['role']):string { return role==='STUDENT'?'/student':role==='STAFF'?'/staff/scan':'/admin' }
export function RoleProvider({children}:{children:ReactNode}) {
 const [account,setAccount]=useState<Account|null>(null)
 const [status,setStatus]=useState<Context['status']>(()=>getToken()?'loading':'signed-out')
 useEffect(()=>{ if(!getToken())return; let active=true; http<{user:Account}>('/api/auth/me').then(({user})=>{if(active){setAccount(user);setStatus('signed-in')}}).catch(()=>{if(active){setToken(null);setStatus('signed-out')}});return()=>{active=false} },[])
 async function login(email:string,password:string){ const result=await http<{token:string;user:Account}>('/api/auth/login',{method:'POST',body:{email,password}});setToken(result.token);setAccount(result.user);setStatus('signed-in');return result.user }
 async function signup(name:string,email:string,password:string){ await http('/api/auth/signup',{method:'POST',body:{name,email,password}}) }
 async function logout(){ try{if(getToken())await http('/api/auth/logout',{method:'POST'})}finally{setToken(null);setAccount(null);setStatus('signed-out')} }
 const role:Role=account?.role==='STAFF'?'staff':account?.role==='ADMIN'||account?.role==='SUPER_ADMIN'?'admin':'student'
 const value=useMemo<Context>(()=>({role,config:ROLE_CONFIG[role],account,status,login,signup,logout,user:{name:account?.name??'',subtitle:account?.email??'',initials:(account?.name??'U').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}}),[account,role,status])
 return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useRole():Context {const c=useContext(RoleContext);if(!c)throw new Error('Missing RoleProvider');return c}
