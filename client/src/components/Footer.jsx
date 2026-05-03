import React from 'react'
import { assets } from '../assets/assets'

const Footer = () => {
  return (
    <footer className="px-6 md:px-16 lg:px-24 xl:px-32 pt-8 w-full bg-black text-white">
            <div className="flex flex-col md:flex-row justify-between w-full gap-10 border-b border-white/20 pb-6">
                <div className="md:max-w-96">
                    <img className="w-36 h-auto cursor-pointer "src={assets.logo} alt="logo" onClick={()=>scrollTo({top:0,behavior:'smooth'}) }/>
                    <p className="mt-6 text-sm text-gray-400">
                        QuickShow is your ultimate destination for seamless movie ticket bookings. 
                        Discover the latest blockbusters, secure your favorite seats, 
                        and enjoy a premium cinematic experience with just a few clicks.
                    </p>
                </div>
                <div className="flex-1 flex items-start md:justify-end gap-20">
                    <div>
                        <h2 className="font-semibold mb-5 text-white">Company</h2>
                        <ul className="text-sm space-y-2 text-gray-400">
                          <li>
                              <a href="#" className="hover:text-white transition-colors" 
                                onClick={(e) => { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); }}>
                                Home
                              </a>
                          </li>
                          <li>
                              <a href="#" className="hover:text-white transition-colors" 
                                onClick={(e) => { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); }}>
                                About us
                              </a>
                          </li>
                          <li>
                              <a href="#" className="hover:text-white transition-colors" 
                                onClick={(e) => { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); }}>
                                Contact us
                              </a>
                          </li>
                          <li>
                              <a href="#" className="hover:text-white transition-colors" 
                                onClick={(e) => { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); }}>
                                Privacy policy
                              </a>
                          </li>
                        </ul>
                    </div>
                    <div>
                        <h2 className="font-semibold mb-5 text-white">Get in touch</h2>
                        <div className="text-sm space-y-2 text-gray-400">
                            <p>098 1025559</p>
                            <p>hhprolay@gmail.com</p>
                        </div>
                        <div className="flex items-center gap-4 mt-5" >
                            <a href="https://www.facebook.com/kieuheef" className="hover:-translate-y-0.5 transition-all duration-300"  >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" >
                                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </a>
                            <a href="http://instagram.com/dlycr_ndh/" className="hover:-translate-y-0.5 transition-all duration-300">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M16 11.37a4 4 0 1 1-7.914 1.173A4 4 0 0 1 16 11.37m1.5-4.87h.01" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </a>
                            <a href="https://www.linkedin.com/in/hoang-nguyen-duc-05909336b/" className="hover:-translate-y-0.5 transition-all duration-300">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6M6 9H2v12h4zM4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </a>
                            <a href="https://github.com/HoangDuc1003" className="hover:-translate-y-0.5 transition-all duration-300 ">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M9 18c-4.51 2-5-2-7-2" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            <p className="pt-4 text-center text-xs md:text-sm pb-5 text-gray-500">
                Copyright 2026 © <a href="https://github.com/HoangDuc1003" className="hover:text-white transition-colors">Hoang Duc</a>. All Right Reserved.
            </p>
        </footer>
  )
}

export default Footer