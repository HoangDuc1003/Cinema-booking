import React, {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
} from 'react';
import HeroSection from '../components/HeroSection';

const FeatureSection = lazy(() => import('../components/FeatureSection'));
const TrailerSection = lazy(() => import('../components/TrailerSection'));

const SectionSkeleton = ({ trailer = false }) => (
  <div className="px-4 py-10 animate-pulse sm:px-6 md:px-16 lg:px-24 xl:px-40">
    <div className="mb-6 h-9 w-52 rounded bg-white/10" />
    {trailer ? (
      <div className="mx-auto aspect-video w-full max-w-4xl rounded-xl bg-white/10" />
    ) : (
      <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="aspect-2/3 rounded-lg bg-white/10" />
        ))}
      </div>
    )}
  </div>
);

const DeferredSection = ({ children, fallback }) => {
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    const root = rootRef.current;
    if (visible || !root || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '160px 0px', threshold: 0.01 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={rootRef}>
      {visible ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
};

const Home = () => (
  <>
    <HeroSection autoPreview />
    <DeferredSection fallback={<SectionSkeleton />}>
      <FeatureSection />
    </DeferredSection>
    <DeferredSection fallback={<SectionSkeleton trailer />}>
      <TrailerSection />
    </DeferredSection>
  </>
);

export default Home;
