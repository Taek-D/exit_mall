import {
  AccountRecoveryForms,
  RecoveryFooterLinks,
} from '@/components/AccountRecoveryForms';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface dotted-grid">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-md bg-primary grid place-items-center">
            <span className="text-primary-foreground text-sm font-heading font-semibold">E</span>
          </div>
          <h1 className="font-heading font-semibold text-xl tracking-tight">엑시트몰</h1>
        </div>

        <AccountRecoveryForms defaultTab="password" />
        <RecoveryFooterLinks />
      </div>
    </div>
  );
}
