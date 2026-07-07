import { useEffect, useState } from "react";
import { getPackageDetails } from "../api/endpoints";
import { useAppStore } from "../store/appStore";
import { NotFoundError, NetworkError } from "../api/client";

export function usePackageData() {
  const focusedPackageId = useAppStore((state) => state.focusedPackageId);
  const addBreadcrumb = useAppStore((state) => state.addBreadcrumb);
  const setError = useAppStore((state) => state.setError);
  const setFocusedPackage = useAppStore((state) => state.setFocusedPackage);

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setLocalError] = useState(null);

  useEffect(() => {
    if (!focusedPackageId) return;

    let cancelled = false;
    setIsLoading(true);
    setLocalError(null);

    getPackageDetails(focusedPackageId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setFocusedPackage(result.name, result.package_name);
        setIsLoading(false);
        addBreadcrumb(focusedPackageId, result.package_name);
      })
      .catch((err) => {
        if (cancelled) return;
        setIsLoading(false);
        setLocalError(err);

        if (err instanceof NotFoundError) {
          setError({
            type: "warning",
            message: "Package metadata not found in PyPI registry",
          });
        } else if (err instanceof NetworkError) {
          setError({ type: "network", message: err.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [focusedPackageId, setError, setFocusedPackage, addBreadcrumb]);

  return { data, isLoading, error };
}
