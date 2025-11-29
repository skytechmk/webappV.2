import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';
import { isIOS } from '../utils/deviceDetection';
import { TranslateFn } from '../types';

export const PWAInstallPrompt: React.FC<{ t: TranslateFn }> = ({ t }) => {
  // PWA install prompts disabled per user request
  return null;
};