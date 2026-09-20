import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyBrandTheme, DEFAULT_BRAND, isHexColor, normalizeHex } from "@/lib/brand-theme";
import { getBrandTheme, setBrandTheme } from "@/lib/branding.functions";

/** Administrator control for the two company colors used everywhere in the app. */
export function BrandColorsCard() {
  const qc = useQueryClient();
  const load = useServerFn(getBrandTheme);
  const save = useServerFn(setBrandTheme);
  const { data } = useQuery({ queryKey: ["brand-theme"], queryFn: () => load() });

  const [primary, setPrimary] = useState<string>(DEFAULT_BRAND.primary);
  const [accent, setAccent] = useState<string>(DEFAULT_BRAND.accent);

  useEffect(() => {
    if (data) {
      setPrimary(data.primary);
      setAccent(data.accent);
    }
  }, [data]);

  // Live preview while the administrator is picking.
  useEffect(() => {
    if (isHexColor(primary) && isHexColor(accent)) applyBrandTheme({ primary, accent });
  }, [primary, accent]);

  const mut = useMutation({
    mutationFn: (v: { primary: string; accent: string }) => save({ data: v }),
    onSuccess: (saved) => {
      toast.success("Company colors saved for everyone.");
      applyBrandTheme(saved);
      void qc.invalidateQueries({ queryKey: ["brand-theme"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      if (data) applyBrandTheme(data);
    },
  });

  const field = (label: string, help: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHexColor(value) ? value : "#000000"}
          onChange={(e) => set(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={(e) => set(normalizeHex(e.target.value, DEFAULT_BRAND.primary))}
          className="font-mono"
          spellCheck={false}
        />
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company colors</CardTitle>
        <CardDescription>
          These two colors set the look of the whole app — buttons, menus, charts and highlights.
          Change them here if another company uses this system. Administrators only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "Main color",
            "Used for buttons, links, the side menu and the main chart bars.",
            primary,
            setPrimary,
          )}
          {field("Second color", "Used for highlights, badges and accents.", accent, setAccent)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => mut.mutate({ primary, accent })}
            disabled={mut.isPending || !isHexColor(primary) || !isHexColor(accent)}
          >
            {mut.isPending ? "Saving…" : "Save colors for everyone"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPrimary(DEFAULT_BRAND.primary);
              setAccent(DEFAULT_BRAND.accent);
            }}
          >
            Back to Majestic Care colors
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
