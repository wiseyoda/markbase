import Image from "next/image";

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <Image
      src="/markbase-logo.png"
      alt=""
      width={size}
      height={size}
      className="rounded-[4px]"
      priority
    />
  );
}
