import React, { useState, useEffect } from 'react';
import { QrCode, CheckCircle, Loader2 } from 'lucide-react';

export const VerificationView: React.FC = () => {
  const [step, setStep] = useState<'waiting' | 'scanned' | 'success'>('waiting');

  useEffect(() => {
    if (step === 'waiting') {
      const timer = setTimeout(() => setStep('scanned'), 3000);
      return () => clearTimeout(timer);
    }
    if (step === 'scanned') {
      const timer = setTimeout(() => setStep('success'), 2000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] glass-panel p-8">
      <h2 className="text-2xl font-bold mb-8 text-gray-800 dark:text-white">Verification Process</h2>
      
      <div className="relative w-64 h-64 flex items-center justify-center bg-gray-50 dark:bg-white/5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 mb-8">
        {step === 'waiting' && (
          <div className="text-center animate-pulse">
            <QrCode className="w-32 h-32 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Scan QR Code via Discord Mobile</p>
          </div>
        )}
        
        {step === 'scanned' && (
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-blue-600 dark:text-blue-400 font-medium">Processing...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center animate-bounce">
            <CheckCircle className="w-32 h-32 text-green-500 mx-auto mb-4" />
            <p className="text-green-600 dark:text-green-400 font-bold text-xl">Verified!</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className={`h-2 w-20 rounded-full transition-colors ${step === 'waiting' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
        <div className={`h-2 w-20 rounded-full transition-colors ${step === 'scanned' ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
        <div className={`h-2 w-20 rounded-full transition-colors ${step === 'success' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
      </div>
      
      <button 
        onClick={() => setStep('waiting')}
        className="mt-8 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        Reset Simulation
      </button>
    </div>
  );
};
