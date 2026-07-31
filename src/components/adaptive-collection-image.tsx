"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

type AdaptiveCollectionImageProps = ImageProps & {
  pixelThreshold?: number;
};

export default function AdaptiveCollectionImage({
  pixelThreshold = 300,
  className,
  onLoad,
  ...props
}: AdaptiveCollectionImageProps) {
  const [pixelated, setPixelated] = useState(false);

  return (
    <Image
      {...props}
      className={[
        className,
        pixelated
          ? "artwork-image-pixelated"
          : "artwork-image-smooth",
      ]
        .filter(Boolean)
        .join(" ")}
      onLoad={(event) => {
        const image = event.currentTarget;

        setPixelated(
          image.naturalWidth < pixelThreshold ||
            image.naturalHeight < pixelThreshold,
        );

        onLoad?.(event);
      }}
    />
  );
}
