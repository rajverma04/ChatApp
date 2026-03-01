import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

const AuthForm = ({ userName, setUserName, password, setPassword, handleSubmit }) => {
  return (
    <div className="flex items-center justify-center h-full w-full p-4">
      <Card className="w-full max-w-md shadow-2xl border-2 border-sky-200 dark:border-sky-900 bg-linear-to-br from-white to-sky-50 dark:from-gray-900 dark:to-sky-950">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <MessageCircle className="h-16 w-16 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold">
            Welcome to Chat App
          </CardTitle>
          <CardDescription className="text-base">
            Login or create a new account to start chatting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Username"
                minLength={3}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                minLength={3}
                required
                className="h-12 text-base"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 text-base"
              size="lg"
            >
              Login / Sign Up
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthForm;
