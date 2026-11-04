import React from 'react';

/**
 * SystemGate passes through children directly now that system is fully open.
 * Ensures students and administrators always reach their intended pages.
 */
const SystemGate = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export default SystemGate;
