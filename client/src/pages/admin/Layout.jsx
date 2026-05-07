import React from 'react'
import AdminNavbar from '../../components/admin/AdminNavbar'
import AdminSideBar from '../../components/admin/AdminSideBar'
import { Outlet } from 'react-router-dom'
const Layout = () => {
  return (
    <>
        <AdminNavbar/> 
        <div className='flex'>
            <AdminSideBar/>
            <div className='flex-1 px-4 py-10 md:px-10 h-[calc(100vh-64px)] overflow-y-auto'>
                <Outlet/>
            </div>
        </div>
    </>
  )
}

export default Layout