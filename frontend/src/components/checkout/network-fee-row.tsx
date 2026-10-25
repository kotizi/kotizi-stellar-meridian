import { SurfaceRow } from "@/components/kz/surface-list";
import { Badge } from "@/components/ui/badge";

/** The app's relay pays every network fee and rent; confirmation screens say so in one row. */
export function NetworkFeeRow() {
  return (
    <SurfaceRow
      label="Network fee"
      value={
        <span className="inline-flex items-center gap-2">
          <span className="text-tertiary">covered by kotizi</span>
          <Badge tone="success">Free</Badge>
        </span>
      }
    />
  );
}
