import React from 'react';

/** SystemGate: Maintenance and closure checks are permanently disabled. */
const SystemGate = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export default SystemGate;