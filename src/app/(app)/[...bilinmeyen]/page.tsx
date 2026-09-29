import { notFound } from "next/navigation";

// Uygulama içindeki bilinmeyen adresler: 404, menü ve üst bar içinde ((app)/not-found.tsx) gösterilir.
export default function UnknownPage() {
  notFound();
}
