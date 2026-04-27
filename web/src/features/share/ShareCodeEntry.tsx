import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAcceptShare } from "./useShare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function friendlyError(message: string): string {
  if (message.includes("resource-exhausted")) return "This code has already been used.";
  if (message.includes("deadline-exceeded")) return "This code has expired.";
  if (message.includes("not-found")) return "Code not found. Check and try again.";
  if (message.includes("failed-precondition")) return "This share is no longer active.";
  return "Failed to accept share. Please try again.";
}

export default function ShareCodeEntry() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const acceptMutation = useAcceptShare();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setError(null);

    acceptMutation.mutate(
      { code: code.toUpperCase() },
      {
        onSuccess: (data) => {
          navigate(`/records/${data.recordId}`);
        },
        onError: (err) => {
          setError(friendlyError(err instanceof Error ? err.message : ""));
        },
      }
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Enter Share Code</CardTitle>
          <CardDescription>
            Enter the 6-character code from the sender to receive the record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="share-code">Share code</Label>
              <Input
                id="share-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                className="font-mono tracking-widest text-center text-lg uppercase"
                disabled={acceptMutation.isPending}
                autoComplete="off"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={code.length !== 6 || acceptMutation.isPending}
            >
              {acceptMutation.isPending ? "Accepting..." : "Accept Share"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}