import React from 'react';

/**
 * Loading — Reusable loading spinner with optional message.
 *
 * FIX: Removed unused `useNavigate()` import — this was importing the entire
 * react-router-dom module just for a spinner, increasing this component's
 * bundle cost for no reason.
 */
const Loading = ({ message = 'Loading movies...' }) => {
  return (
    <div className='flex flex-col justify-center px-6 md:px-6 lg:px-40 mt-25'>
      <div className='flex flex-col justify-center items-center'>
        <div className='animate-spin rounded-full h-14 w-14 border-2 border-t-primary mt-40'></div>
        <div className='text-xl font-semibold text-white mt-5 mb-55 justify-center text-center'>
          {message}
        </div>
      </div>
    </div>
  );
};

export default React.memo(Loading);