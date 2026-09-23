import React from 'react'
import AdminNavbar from '../../components/admin/AdminNavbar'
import AdminSideBar from '../../components/admin/AdminSideBar'
import { Outlet } from 'react-router-dom'
import { useAppContext } from '../../context/AppContext'
import Loading from '../../components/Loading'
const Layout = () => {

  // AppProvider checks admin status once per signed-in user and redirects
  // confirmed non-admins, so this only waits for that answer.
  const { isAdmin } = useAppContext()

  return isAdmin?(
    <>
        <AdminNavbar/> 
        <div className='flex min-h-[calc(100vh-64px)]'>
            <AdminSideBar/>
            <div className='flex-1 min-w-0 px-4 py-8 md:px-10 h-[calc(100vh-64px)] overflow-y-auto'>
                <Outlet/>
            </div>
        </div>
    </>
  ):<Loading/>
}

export default Layout
