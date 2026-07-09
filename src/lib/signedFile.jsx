import { useEffect, useState } from 'react';
import { wedflow } from '@/api/wedflowClient';

// Resolves a stored object path to a short-lived signed URL (bucket is private; see 0016).
export function useSignedUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    if (!path) { setUrl(null); return; }
    wedflow.integrations.Core.getSignedUrl(path)
      .then((u) => { if (active) setUrl(u); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [path]);
  return url;
}

export function SignedFileLink({ path, className, children }) {
  const url = useSignedUrl(path);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
}

export function SignedImage({ path, ...props }) {
  const url = useSignedUrl(path);
  if (!url) return null;
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={url} {...props} />;
}
