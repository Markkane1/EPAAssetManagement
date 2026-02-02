import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import epaLogo from '@/assets/epa-logo.jpg';
import { CaptchaChallenge } from '@/components/auth/CaptchaChallenge';
import { 
  loginSchema, 
  recordFailedAttempt, 
  clearLoginAttempts, 
  isAccountLocked 
} from '@/lib/securityUtils';
import { auditLog } from '@/lib/auditLog';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [lockoutInfo, setLockoutInfo] = useState({ locked: false, remainingMinutes: 0 });
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || '/';

  // Check lockout status on mount and periodically
  useEffect(() => {
    const checkLockout = () => {
      setLockoutInfo(isAccountLocked());
    };
    checkLockout();
    const interval = setInterval(checkLockout, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Check if account is locked
    const lockStatus = isAccountLocked();
    if (lockStatus.locked) {
      setLockoutInfo(lockStatus);
      return;
    }

    // Validate CAPTCHA
    if (!isCaptchaVerified) {
      setError('Please complete the security check');
      return;
    }

    // Validate inputs with zod
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      const errors: { email?: string; password?: string } = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0] === 'email') errors.email = err.message;
        if (err.path[0] === 'password') errors.password = err.message;
      });
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      await login(email, password);
      clearLoginAttempts();
      auditLog.loginSuccess(email);
      navigate(from, { replace: true });
    } catch (err: any) {
      const attemptResult = recordFailedAttempt();
      auditLog.loginFailed(email, err.message);
      if (attemptResult.isLocked) {
        setError(`Too many failed attempts. Account locked for ${attemptResult.lockoutMinutes} minutes.`);
        setLockoutInfo({ locked: true, remainingMinutes: attemptResult.lockoutMinutes });
      } else if (attemptResult.remainingAttempts > 0) {
        setError(`${err.message || 'Failed to login'} (${attemptResult.remainingAttempts} attempts remaining)`);
      } else {
        setError(err.message || 'Failed to login. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isFormDisabled = isLoading || lockoutInfo.locked;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <img
              src={epaLogo}
              alt="EPA Logo"
              className="h-7 w-7 object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">EPA AMS</h1>
          <p className="text-sm text-muted-foreground">Asset Management System</p>
        </div>

        <Card>
          <CardHeader className="text-center space-y-1">
            <CardTitle>Staff Login</CardTitle>
            <CardDescription>
              Sign in to access the staff dashboard.
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {lockoutInfo.locked && (
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertDescription>
                    Account temporarily locked. Please try again in {lockoutInfo.remainingMinutes} minute(s).
                  </AlertDescription>
                </Alert>
              )}
              
              {error && !lockoutInfo.locked && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
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
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isFormDisabled}
                  className={`h-11 ${fieldErrors.email ? 'border-destructive' : ''}`}
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link 
                    to="/forgot-password" 
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isFormDisabled}
                    className={`h-11 pr-10 ${fieldErrors.password ? 'border-destructive' : ''}`}
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-11 w-11 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs text-destructive">{fieldErrors.password}</p>
                )}
              </div>

              {/* CAPTCHA */}
              <CaptchaChallenge 
                onVerify={setIsCaptchaVerified} 
                isVerified={isCaptchaVerified} 
              />
            </CardContent>
            
            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full h-11" 
                disabled={isFormDisabled || !isCaptchaVerified}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
              
              <p className="text-sm text-center text-muted-foreground">
                Contact your administrator to request an account
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
