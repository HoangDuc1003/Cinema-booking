import React, { Suspense, lazy } from 'react'
import HeroSection from '../components/HeroSection'

const FeatureSection = lazy(() => import('../components/FeatureSection'))
const TrailerSection = lazy(() => import('../components/TrailerSection'))

const Home = () => {
  return (
    <>
      <HeroSection/>
      <Suspense fallback={null}>
        <FeatureSection/>
        <TrailerSection/>
      </Suspense>
    </>
  )
}

export default Home
