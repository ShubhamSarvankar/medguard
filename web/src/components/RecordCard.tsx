import { Link } from "react-router-dom";
import type { MedicalRecord } from "@medguard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RecordCardProps {
  record: MedicalRecord;
}

export function RecordCard({ record }: RecordCardProps) {
  const visitDate = new Date(
    (record.visitDate as unknown as { seconds: number }).seconds * 1000
  ).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link to={`/records/${record.recordId}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{record.title}</CardTitle>
            {!record.isDeidentified && (
              <Badge variant="outline" className="shrink-0 text-xs text-amber-600 border-amber-400">
                Pending
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{visitDate}</p>
        </CardHeader>
        {record.diagnoses.length > 0 && (
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-muted-foreground truncate">
              {record.diagnoses.map((d) => d.code).join(", ")}
            </p>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}