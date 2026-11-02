import React from 'react';

interface MaintenanceScreenProps {
  closedUntil?: string | null;
  title?: string | null;
  message?: string | null;
  imageUrl?: string | null;
  mode?: string | null;
}

/** Maintenance screen is permanently disabled. */
const MaintenanceScreen = (_props: MaintenanceScreenProps) => {
  return null;
};

export default MaintenanceScreen;