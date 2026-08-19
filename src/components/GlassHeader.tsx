import { FileText, Sparkles } from "lucide-react";

export const GlassHeader = () => {
  return (
    <header className="relative border-b border-glass-border bg-glass-bg/50 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Logo with glass effect */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-warm rounded-xl blur-sm opacity-60"></div>
              <div className="relative rounded-xl bg-glass-bg backdrop-blur-sm border border-glass-border p-3 shadow-glass">
                <FileText className="h-6 w-6 text-primary" />
              </div>
            </div>
            
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground bg-gradient-warm bg-clip-text text-transparent">
                OffGridPDF
              </h1>
              <div className="flex items-center space-x-1">
                <Sparkles className="h-3 w-3 text-primary-soft" />
                <p className="text-sm text-muted-foreground font-medium">Professional Document Tools</p>
              </div>
            </div>
          </div>

          {/* Decorative element */}
          <div className="hidden md:flex items-center space-x-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-primary animate-glow-pulse"></div>
            <span>Offline Processing</span>
          </div>
        </div>
      </div>
      
      {/* Subtle gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
    </header>
  );
};