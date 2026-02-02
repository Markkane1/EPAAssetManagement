import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCw, ShieldCheck } from 'lucide-react';

interface CaptchaChallengeProps {
  onVerify: (isValid: boolean) => void;
  isVerified: boolean;
}

const generateChallenge = () => {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operators = ['+', '-', '×'] as const;
  const operator = operators[Math.floor(Math.random() * operators.length)];
  
  let answer: number;
  switch (operator) {
    case '+':
      answer = num1 + num2;
      break;
    case '-':
      answer = Math.max(num1, num2) - Math.min(num1, num2);
      return {
        question: `${Math.max(num1, num2)} ${operator} ${Math.min(num1, num2)}`,
        answer
      };
    case '×':
      answer = num1 * num2;
      break;
    default:
      answer = num1 + num2;
  }
  
  return {
    question: `${num1} ${operator} ${num2}`,
    answer
  };
};

export function CaptchaChallenge({ onVerify, isVerified }: CaptchaChallengeProps) {
  const [challenge, setChallenge] = useState(generateChallenge);
  const [userAnswer, setUserAnswer] = useState('');
  const [error, setError] = useState('');

  const refreshChallenge = useCallback(() => {
    setChallenge(generateChallenge());
    setUserAnswer('');
    setError('');
    onVerify(false);
  }, [onVerify]);

  useEffect(() => {
    if (userAnswer === '') {
      setError('');
      return;
    }

    const numAnswer = parseInt(userAnswer, 10);
    if (!isNaN(numAnswer) && numAnswer === challenge.answer) {
      onVerify(true);
      setError('');
    } else if (userAnswer.length >= String(challenge.answer).length) {
      onVerify(false);
      setError('Incorrect answer');
    } else {
      onVerify(false);
    }
  }, [userAnswer, challenge.answer, onVerify]);

  if (isVerified) {
    return (
      <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium text-primary">Verified</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Security Check</Label>
      <div className="flex items-center gap-2 p-3 bg-muted/50 border rounded-lg">
        <div className="flex-1">
          <span className="text-sm text-muted-foreground">Solve: </span>
          <span className="font-mono font-bold text-foreground">{challenge.question} = ?</span>
        </div>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value.replace(/[^0-9-]/g, ''))}
          className="w-20 h-9 text-center font-mono"
          placeholder="?"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={refreshChallenge}
          className="h-9 w-9"
          title="New challenge"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
