import React from 'react'
import HeroSection from '../components/HeroSection'
import FeatureSection from '../components/FeatureSection'
import MovieCard from '../components/MovieCard'
import TrailersSection from '../components/TrailersSection'

// feat: Main home page component with multiple sections
const Home = () => {
  return (
    <>
      <HeroSection/>
      <FeatureSection/>
      <TrailersSection/>
    </>
  )
}

export default Home