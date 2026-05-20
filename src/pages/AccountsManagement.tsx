import { useNavigate } from "react-router-dom";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AccountsManager } from "@/components/AccountsManager";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function AccountsManagement() {
  const nav = useNavigate();
  return (
    <>
      <ScreenHeader
        title="Investing accounts"
        subtitle="Add, edit, and remove your portfolio accounts."
        right={
          <Button variant="ghost" size="sm" onClick={() => nav("/settings")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />
      <div className="px-5">
        <AccountsManager />
      </div>
    </>
  );
}
