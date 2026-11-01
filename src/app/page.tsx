"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { propertyPath } from "@/lib/property";
import { getToken } from "@/lib/session";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(propertyPath(getToken() ? "/till" : "/login"));
  }, [router]);
  return null;
}
