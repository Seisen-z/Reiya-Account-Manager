import { FC, ReactNode } from "react";

export const SectionHeader: FC<{
  dotColor: string;
  dotShadow?: string;
  title: ReactNode;
  trailing?: ReactNode;
  style?: React.CSSProperties;
}> = ({ dotColor, dotShadow, title, trailing, style }) => {
  return (
    <div className="section-header" style={style}>
      <span className="section-title">
        <span className="section-dot" style={{ background: dotColor, boxShadow: dotShadow }} />
        {title}
      </span>
      {trailing}
    </div>
  );
};
