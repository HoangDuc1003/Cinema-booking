import React from 'react'

// chore: Decorative blur circle component for visual effects
const BlurCircle = ({
  top = "auto",
  left = "auto",
  right = "auto",
  bottom = "auto",
  delay = "0s"
}) => {
  return (
    // feat: Absolute positioned blurred circle element with floating animation
    <div
      className="absolute -z-100 w-68 h-68 aspect-square rounded-full bg-primary/60 blur-3xl animate-float-blob"
      style={{
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