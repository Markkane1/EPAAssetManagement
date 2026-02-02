import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import epaLogo from "@/assets/epa-logo.jpg";
import { toast } from "sonner";
import api from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
      toast.success("Password request submitted");
    } catch (error: any) {
      toast.error(error?.message || "Unable to submit request");
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
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@EPAPunjab.gov.pk"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={submitted}
                  className="h-11"
                  autoComplete="email"
                />
              </div>
              {submitted && (
                <p className="text-sm text-muted-foreground">
                  If an account exists for this email, the administrator will contact you with reset instructions.
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full h-11" disabled={submitted}>
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
