import React from 'react'

// chore: Decorative blur circle component for visual effects
const BlurCircle = ({top = "auto", left = "auto", right = "auto" , bottom = "auto"}) => {
  return (
    // feat: Absolute positioned blurred circle element
    <div className="absolute -z-100 w-58 h-58 aspect-square rounded-full bg-primary/30 blur-3xl" 
    style={{top:top, left:left,right:right,bottom:bottom}}>
    </div>
  )
}

export default BlurCircle