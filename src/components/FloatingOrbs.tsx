export const FloatingOrbs = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Floating orbs with different positions and delays */}
      <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-gradient-warm opacity-20 animate-float blur-sm" 
           style={{ animationDelay: '0s' }} />
      <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-gradient-warm opacity-15 animate-float blur-sm" 
           style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-32 left-1/4 w-40 h-40 rounded-full bg-gradient-warm opacity-10 animate-float blur-md" 
           style={{ animationDelay: '4s' }} />
      <div className="absolute bottom-20 right-1/3 w-28 h-28 rounded-full bg-gradient-warm opacity-25 animate-float blur-sm" 
           style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 rounded-full bg-gradient-warm opacity-5 animate-float blur-lg" 
           style={{ animationDelay: '3s' }} />
    </div>
  );
};