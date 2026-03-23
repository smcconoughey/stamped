import { redirect } from "next/navigation";

export default function PlatformRoot() {
  redirect("/platform/tenants");
}
