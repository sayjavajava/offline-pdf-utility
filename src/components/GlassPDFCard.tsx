import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface GlassPDFCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  delay?: number;
}

export const GlassPDFCard = ({ title, description, icon: Icon, onClick, delay = 0 }: GlassPDFCardProps) => {
  const activate = () => onClick();

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={title}
      className="group cursor-pointer overflow-hidden animate-slide-up bg-glass-bg/10 backdrop-blur-sm border border-glass-border shadow-glass hover:shadow-glass-hover transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ animationDelay: `${delay}ms` }}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <CardContent className="relative p-8 text-center transition-all duration-500 group-hover:transform group-hover:scale-105">
        <div className="absolute inset-0 bg-gradient-warm opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-lg"></div>

        <div className="relative mb-6 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-warm rounded-2xl blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative rounded-2xl bg-glass-bg backdrop-blur-sm border border-glass-border p-4 group-hover:shadow-glass-hover transition-all duration-500">
              <Icon className="h-8 w-8 text-primary group-hover:text-primary-soft transition-colors duration-300" aria-hidden="true" />
            </div>
          </div>
        </div>

        <h3 className="relative mb-3 text-xl font-display font-semibold text-foreground group-hover:text-primary-soft transition-colors duration-300">
          {title}
        </h3>

        <p className="relative text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors duration-300">
          {description}
        </p>

        <div className="absolute inset-0 rounded-lg shadow-glass opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
      </CardContent>
    </Card>
  );
};
