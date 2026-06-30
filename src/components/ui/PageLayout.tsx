import React from 'react';
import { useIsMobile } from '../../hooks/useWindowWidth';

interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** コンテンツ最大幅。数値はpx。falseで最大幅なし（フル幅）。既定 960px */
  maxWidth?: number | string | false;
  /** true で直下の子を縦方向に一定間隔（--section-gap）で並べる */
  stack?: boolean;
  /** 左右余白を消す（フルブリード用） */
  noPaddingX?: boolean;
  /** 上下余白を消す */
  noPaddingY?: boolean;
}

/**
 * 全画面共通のページ枠。最外周の余白・最大幅・センタリング・セクション間隔を
 * 1か所に集約し、画面間の不統一を防ぐ。
 *
 * 標準値（index.css のレイアウトトークン）:
 *  - 左右余白: デスクトップ 24px / モバイル 16px
 *  - 上下余白: デスクトップ 32px / モバイル 16px
 *  - セクション間隔(stack): デスクトップ 24px / モバイル 16px
 *  - 最大幅: 960px
 */
const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  maxWidth = 'var(--page-max-width)',
  stack = false,
  noPaddingX = false,
  noPaddingY = false,
  style,
  ...rest
}) => {
  const isMobile = useIsMobile();

  const padX = noPaddingX
    ? 0
    : isMobile
      ? 'var(--page-pad-x-mobile)'
      : 'var(--page-pad-x)';
  const padY = noPaddingY
    ? 0
    : isMobile
      ? 'var(--page-pad-y-mobile)'
      : 'var(--page-pad-y)';

  const resolvedMaxWidth =
    maxWidth === false ? undefined : typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;

  return (
    <div
      {...rest}
      style={{
        width: '100%',
        maxWidth: resolvedMaxWidth,
        marginLeft: 'auto',
        marginRight: 'auto',
        padding: `${padY} ${padX}`,
        boxSizing: 'border-box',
        ...(stack
          ? {
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? 'var(--section-gap-mobile)' : 'var(--section-gap)',
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default PageLayout;
