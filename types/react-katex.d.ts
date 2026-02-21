declare module "react-katex" {
  import { FC } from "react";

  interface MathProps {
    math: string;
    errorColor?: string;
    renderError?: (error: Error | TypeError) => React.ReactNode;
  }

  export const InlineMath: FC<MathProps>;
  export const BlockMath: FC<MathProps>;
}
