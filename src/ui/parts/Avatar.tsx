import { useEffect, useState, type SyntheticEvent } from "react";
import { avatarUrl } from "../../demo/avatar";
import { isDemo } from "../../demo/flag";
import { kindOf, remember, type Kind } from "../avatarKinds";
import { orbStyle } from "../orb";
import { useOrbLook } from "../orbLookStore";

/**
 * GitHub avatar. GitHub's generated identicons (a 5×5 pattern for accounts without a picture)
 * are swapped for a calm placeholder: a soft gradient orb of three matching colors with the login's
 * first letter in translucent white. Palette and cloud positions come from the login, so people
 * stay apart. Whether an image is an identicon is decided
 * once per login from its pixels and remembered on this Mac; until then the placeholder shows,
 * so an identicon never flashes. A failed image shows the placeholder and loads again once the
 * connection is back.
 *
 * @param src  The avatar URL from the API, or a data URL. Needed for bots and apps; without it
 *             avatars.githubusercontent.com/<login> is used, which, unlike github.com/<login>.png,
 *             allows reading the pixels.
 *
 * @example
 *   <Avatar login={post.author} src={item.avatars[post.author]} size={20} />
 */
export function Avatar({ login, src: given, size = 18 }: { login: string; src?: string; size?: number }) {
  // The demo draws its own, so no real person's picture is ever requested.
  const src = given ?? (isDemo() ? avatarUrl(login) : undefined);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Kind | undefined>(src?.startsWith("data:") ? "photo" : kindOf(login));

  useEffect(() => {
    if (!failed) return;
    const retry = () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed]);

  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    if (kind) return;
    const next = isIdenticon(e.currentTarget) ? "default" : "photo";
    remember(login, next);
    setKind(next);
  };

  if (kind === "default" || failed) return <Placeholder login={login} size={size} />;

  const url = src?.startsWith("data:")
    ? src
    : `${src ?? `https://avatars.githubusercontent.com/${encodeURIComponent(login)}`}${src?.includes("?") ? "&" : "?"}s=${size * 2}`;
  const img = (
    <img
      key={attempt}
      className="avatar"
      src={url}
      crossOrigin="anonymous"
      width={size}
      height={size}
      alt=""
      title={login}
      draggable={false}
      onLoad={onLoad}
      onError={() => setFailed(true)}
    />
  );
  // Not decided yet: the image loads hidden behind the placeholder.
  if (!kind) {
    return (
      <span className="avatar avatar-pending" style={{ width: size, height: size }}>
        <Placeholder login={login} size={size} />
        {img}
      </span>
    );
  }
  return img;
}

function Placeholder({ login, size }: { login: string; size: number }) {
  const look = useOrbLook(login);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.52), ...orbStyle(login, look) };
  return (
    <span className="avatar avatar-placeholder" style={style} title={login} aria-hidden>
      {[...login][0]?.toUpperCase()}
    </span>
  );
}

/**
 * True for GitHub's identicon: a light grey ground (#f0f0f0) and one other color, nothing else.
 * Photos and drawn avatars have many colors; a pixel that fits neither rules the image out.
 */
function isIdenticon(img: HTMLImageElement): boolean {
  try {
    const n = 16;
    const canvas = document.createElement("canvas");
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    // Nearest-pixel sampling: smoothing would blend the pattern's edges into extra colors.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, n, n);
    const data = ctx.getImageData(0, 0, n, n).data;
    let ground = 0;
    let other: number[] | null = null;
    for (let i = 0; i < data.length; i += 4) {
      const px = [data[i], data[i + 1], data[i + 2]];
      if (px.every((v) => Math.abs(v - 240) <= 8)) {
        ground++;
        continue;
      }
      if (!other) other = px;
      else if (px.some((v, j) => Math.abs(v - other![j]) > 40)) return false;
    }
    return ground > n * n * 0.25 && other !== null;
  } catch {
    // A tainted canvas (no CORS) cannot be read; treat the image as a real picture.
    return false;
  }
}
