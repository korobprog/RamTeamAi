import { useEffect, useState } from "react";
import type { GithubUserProfile } from "../types";

function profileInitial(profile?: GithubUserProfile): string {
  const value = profile?.name?.trim() || profile?.login?.trim();
  return value ? value[0].toUpperCase() : "";
}

export function GithubAvatar({ profile, className }: { profile?: GithubUserProfile; className: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = profile?.avatarUrl?.trim();
  const initial = profileInitial(profile);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span className={className}>
      {src && !imageFailed ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
      ) : initial ? (
        <span className="avatar-initial" aria-hidden="true">{initial}</span>
      ) : (
        <i className="ti ti-user" aria-hidden="true" />
      )}
    </span>
  );
}
