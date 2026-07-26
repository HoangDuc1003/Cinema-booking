import React from 'react'


const BlurCircle = ({
  top = "auto",
  left = "auto",
  right = "auto",
  bottom = "auto",
  delay = "0s"
}) => {
  return (

    <div
      className="absolute w-72 h-72 aspect-square rounded-full bg-primary/60 blur-3xl animate-float-blob pointer-events-none"
      style={{
        zIndex: -100,
        top: top,
        left: left,
        right: right,
        bottom: bottom,
        animationDelay: delay
      }}
    >
    </div>
  )
}

export default BlurCircle