import type { Metadata } from "next";
import type { SearchParams } from "@/lib/list-params";
import { KasaView } from "../_components/KasaView";

export const metadata: Metadata = { title: "Mekonsis kasası" };

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <KasaView searchParams={searchParams} owner="mekonsis" />;
}
