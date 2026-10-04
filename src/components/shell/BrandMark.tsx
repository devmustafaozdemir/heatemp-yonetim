import Image from "next/image";
import mark from "@/assets/brand/heatemp-mark.png";
import { cx } from "@/components/ui";

/**
 * Heatemp "HT" işareti beyaz, yuvarlak köşeli zemin üzerinde. Logo açık zemin için
 * tasarlandığından koyu menüde ve giriş panelinde bu zeminle gösterilir.
 */
export function BrandMark({ className, preload }: { className?: string; preload?: boolean }) {
  return (
    <span className={cx("flex shrink-0 items-center justify-center rounded-md bg-white p-1 shadow-sm", className)}>
      <Image src={mark} alt="" sizes="48px" preload={preload} className="h-auto w-full" />
    </span>
  );
}
