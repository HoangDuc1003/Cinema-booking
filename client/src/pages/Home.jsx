import React, { Suspense, lazy } from 'react'
import HeroSection from '../components/HeroSection'
import useIntersectionObserver from '../hooks/useIntersectionObserver'

const FeatureSection = lazy(() => import('../components/FeatureSection'))
const TrailerSection = lazy(() => import('../components/TrailerSection'))

const DeferredSection = ({ children, minHeight = 'min-h-80', rootMargin = '500px 0px' }) => {
  const { ref, isVisible } = useIntersectionObserver({ threshold: 0.01, rootMargin })

  return (
    <div ref={ref} className={isVisible ? undefined : minHeight}>
      {isVisible && (
        <Suspense fallback={null}>
          {children}
        </Suspense>
      )}
    </div>
  )
}

const Home = () => {
  return (
    <>
      <HeroSection/>
      <DeferredSection minHeight="min-h-[640px]" rootMargin="700px 0px">
        <FeatureSection/>
      </DeferredSection>
      <DeferredSection minHeight="min-h-[480px]" rootMargin="500px 0px">
        <TrailerSection/>
      </DeferredSection>
    </>
  )
}

export default Home
