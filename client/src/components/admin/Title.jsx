import React from 'react'

const Title = ({text1,text2}) => {
  return (
    <h1 className='relative text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-5 '>
        {text1}<span className='underline text-primary'>
        {text2}</span>
    </h1>
  )
}

export default Title
