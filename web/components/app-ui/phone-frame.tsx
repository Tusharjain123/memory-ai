/* Shared chrome for REAL app screenshots. Deliberately solid-edged so it never
   gets confused with the dashed `.recreation` wrappers used for the hand-built
   CSS illustrations in this directory. */
export function PhoneFrame({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  priority?: boolean;
}) {
  return (
    <figure className="phone-frame">
      <span className="phone-frame-screen">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={560}
          height={1218}
          decoding="async"
          {...(priority
            ? { fetchPriority: "high" as const }
            : { loading: "lazy" as const })}
        />
      </span>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
