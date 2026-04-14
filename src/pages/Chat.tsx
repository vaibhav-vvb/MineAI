import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, BookOpen, Plus, LogOut, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

const Chat = () => {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session) {
        console.log("No valid session, redirecting...");
        navigate("/auth");
        return;
      }

      setUser(session.user);

      supabase.auth.onAuthStateChange(async (_event, session) => {
        console.log("Auth state changed:", _event);
        if (!session?.user) {
          setUser(null);
          navigate("/auth");
        } else {
          setUser(session.user);
        }
      });
    } catch (err) {
      console.error("Auth check error:", err);
      navigate("/auth");
    }
  };

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setConversations(data || []);

      if (data && data.length > 0 && !currentConversationId) {
        loadConversation(data[0].id);
      }
    } catch (error: any) {
      console.error("Error fetching conversations:", error);
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      setCurrentConversationId(conversationId);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const formattedMessages = data?.map((msg) => ({
        id: msg.id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
        timestamp: new Date(msg.created_at),
      })) || [];

      setMessages(formattedMessages);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const createNewConversation = async () => {
    try {
      if (!user) return;
      
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentConversationId(data.id);
      setMessages([]);
      fetchConversations();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  // const handleSend = async () => {
  //   if (!input.trim()) return;

  //   try {
  //     console.log("=== Starting handleSend ===");
      
  //     // Get current session (don't refresh yet)
  //     const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
  //     if (sessionError || !session) {
  //       console.error("No session:", sessionError);
  //       toast({
  //         variant: "destructive",
  //         title: "Not Authenticated",
  //         description: "Please log in again",
  //       });
  //       navigate("/auth");
  //       return;
  //     }

  //     console.log("✅ Session exists, user:", session.user.id);

  //     let convId = currentConversationId;

  //     // Create conversation if needed
  //     if (!convId) {
  //       const { data, error } = await supabase
  //         .from("conversations")
  //         .insert({ user_id: session.user.id })
  //         .select()
  //         .single();

  //       if (error) {
  //         console.error("Error creating conversation:", error);
  //         toast({
  //           variant: "destructive",
  //           title: "Error creating conversation",
  //           description: error.message,
  //         });
  //         return;
  //       }

  //       convId = data.id;
  //       setCurrentConversationId(convId);
  //       fetchConversations();
  //     }

  //     const userMessage = {
  //       id: Date.now().toString(),
  //       role: "user" as const,
  //       content: input,
  //       timestamp: new Date(),
  //     };

  //     setMessages((prev) => [...prev, userMessage]);
  //     setInput("");

  //     // Save user message to database
  //     const { error: saveError } = await supabase.from("messages").insert({
  //       conversation_id: convId,
  //       role: "user",
  //       content: userMessage.content,
  //     });

  //     if (saveError) {
  //       console.error("Error saving user message:", saveError);
  //     }

  //     // Prepare conversation history
  //     const conversationMessages = [...messages, userMessage].map((msg) => ({
  //       role: msg.role,
  //       content: msg.content,
  //     }));

  //     console.log("🚀 Calling edge function...");
  //     console.log("URL:", `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`);
  //     console.log("Token (first 20 chars):", session.access_token.substring(0, 20));

  //     const response = await fetch(
  //       `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
  //       {
  //         method: "POST",
  //         headers: {
  //           "Content-Type": "application/json",
  //           "Authorization": `Bearer ${session.access_token}`,
  //           "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
  //         },
  //         body: JSON.stringify({
  //           messages: conversationMessages,
  //           conversationId: convId,
  //         }),
  //       }
  //     );

  //     console.log("📥 Response status:", response.status);

  //     const text = await response.text();
  //     console.log("📥 Response body:", text);

  //     if (!response.ok) {
  //       let errorMessage = "Server error";
  //       try {
  //         const errorData = JSON.parse(text);
  //         errorMessage = errorData.error || errorData.message || `Error ${response.status}`;
  //       } catch {
  //         errorMessage = text || `Server error: ${response.status}`;
  //       }
  //       throw new Error(errorMessage);
  //     }

  //     const data = JSON.parse(text);

  //     const assistantMessage = {
  //       id: (Date.now() + 1).toString(),
  //       role: "assistant" as const,
  //       content: data.answer,
  //       timestamp: new Date(),
  //     };

  //     setMessages((prev) => [...prev, assistantMessage]);

  //     // Save assistant message
  //     await supabase.from("messages").insert({
  //       conversation_id: convId,
  //       role: "assistant",
  //       content: data.answer,
  //     });

  //     console.log("✅ Chat completed successfully");

  //   } catch (err: any) {
  //     console.error("❌ Chat error:", err);
  //     toast({
  //       variant: "destructive",
  //       title: "Chat Error",
  //       description: err.message || "Failed to get response",
  //     });
  //   }
  // };

  const handleSend = async () => {
  if (!input.trim()) return;

  try {
    console.log("=== Starting handleSend ===");
    
    // FORCE REFRESH SESSION to get token signed with new key
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError || !session) {
      console.error("Session refresh failed:", refreshError);
      
      // Clear everything and force re-login
      await supabase.auth.signOut();
      
      toast({
        variant: "destructive",
        title: "Session Expired",
        description: "Your session has expired. Please log in again.",
      });
      
      navigate("/auth");
      return;
    }

    console.log("✅ Session refreshed successfully");
    console.log("New token (first 30 chars):", session.access_token.substring(0, 30));

    let convId = currentConversationId;

    if (!convId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: session.user.id })
        .select()
        .single();

      if (error) {
        console.error("Error creating conversation:", error);
        toast({
          variant: "destructive",
          title: "Error creating conversation",
          description: error.message,
        });
        return;
      }

      convId = data.id;
      setCurrentConversationId(convId);
      fetchConversations();
    }

    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    const { error: saveError } = await supabase.from("messages").insert({
      conversation_id: convId,
      role: "user",
      content: userMessage.content,
    });

    if (saveError) {
      console.error("Error saving user message:", saveError);
    }

    const conversationMessages = [...messages, userMessage].map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    console.log("🚀 Calling edge function...");

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          messages: conversationMessages,
          conversationId: convId,
        }),
      }
    );

    console.log("📥 Response status:", response.status);

    const text = await response.text();
    console.log("📥 Response body:", text);

    if (!response.ok) {
      let errorMessage = "Server error";
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.error || errorData.message || `Error ${response.status}`;
      } catch {
        errorMessage = text || `Server error: ${response.status}`;
      }
      throw new Error(errorMessage);
    }

    const data = JSON.parse(text);

    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant" as const,
      content: data.answer,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: data.answer,
    });

    console.log("✅ Chat completed successfully");

  } catch (err: any) {
    console.error("❌ Chat error:", err);
    toast({
      variant: "destructive",
      title: "Chat Error",
      description: err.message || "Failed to get response",
    });
  }
};

  const handleDeleteChat = async () => {
    if (!conversationToDelete) return;

    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", conversationToDelete);

      if (error) throw error;

      setConversations((prev) => prev.filter((c) => c.id !== conversationToDelete));

      if (currentConversationId === conversationToDelete) {
        setCurrentConversationId(null);
        setMessages([]);
      }

      toast({
        title: "Chat deleted",
        description: "The conversation has been removed.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The conversation will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-1 pt-16 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r bg-card/50">
          <div className="p-4 border-b space-y-2">
            <Button
              onClick={createNewConversation}
              className="w-full justify-start gradient-primary text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full justify-start"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 w-full px-3 py-2 rounded-lg transition-colors ${
                    currentConversationId === conv.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-accent"
                  }`}
                >
                  <button
                    onClick={() => loadConversation(conv.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConversationToDelete(conv.id);
                      setDeleteDialogOpen(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col">
          <div className="border-b px-6 py-4 glass-effect">
            <h2 className="text-lg font-semibold">MineAI Chat</h2>
            <p className="text-sm text-muted-foreground">Ask anything about Indian mining regulations</p>
          </div>

          <ScrollArea className="flex-1 px-4 md:px-6 py-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.length === 0 && (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto">
                    <span className="text-white text-2xl font-bold">M</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Welcome to MineAI</h3>
                    <p className="text-muted-foreground">
                      Ask me anything about Indian mining laws, regulations, and compliance
                    </p>
                  </div>
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 animate-fade-in ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">M</span>
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                      message.role === "user"
                        ? "gradient-primary text-white"
                        : "glass-effect"
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    <span
                      className={`text-xs mt-2 block ${
                        message.role === "user" ? "text-white/70" : "text-muted-foreground"
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-secondary-foreground text-sm font-bold">U</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-4 glass-effect">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Ask about mining acts, regulations, compliance..."
                    className="min-h-[60px] pr-12 resize-none rounded-2xl"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 bottom-2 rounded-full"
                  >
                    <BookOpen className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={handleSend}
                  size="icon"
                  className="h-[60px] w-[60px] rounded-2xl gradient-primary text-white hover:opacity-90"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Press Enter to send, Shift + Enter for new line
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Chat;