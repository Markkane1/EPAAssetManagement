import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import epaLogo from "@/assets/epa-logo.jpg";
import { toast } from "sonner";
import api from "@/lib/api";
import { emailSchema } from "@/lib/securityUtils";

const forgotPasswordSchema = emailSchema.transform((value) => value.trim().toLowerCase());

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const validation = forgotPasswordSchema.safeParse(email);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "Enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: validation.data });
      setSubmitted(true);
      toast.success("Password request submitted");
    } catch (error: any) {
      toast.error(error?.message || "Unable to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <img src={epaLogo} alt="EPA Logo" className="h-7 w-7 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">EPA AMS</h1>
          <p className="text-sm text-muted-foreground">Asset Management System</p>
        </div>

        <Card>
          <CardHeader className="text-center space-y-1">
            <CardTitle>Forgot Password</CardTitle>
            <CardDescription>Enter your email to request a password reset.</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@EPAPunjab.gov.pk"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError("");
                  }}
                  required
                  disabled={submitted || isSubmitting}
                  className={`h-11 ${error ? "border-destructive" : ""}`}
                  aria-invalid={error ? "true" : "false"}
                  autoComplete="email"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              {submitted && (
                <p className="text-sm text-muted-foreground">
                  If an account exists for this email, the administrator will contact you with reset instructions.
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full h-11" disabled={submitted || isSubmitting}>
                Request Reset
              </Button>
              <Link to="/login" className="text-sm text-primary hover:underline">
                Back to login
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
