import React, { useState, useEffect } from "react";
import {
    Container,
    Snackbar,
    Dialog,
    DialogContent,
    DialogActions,
    Button,
    useMediaQuery,
    useTheme,
    Box,
    Typography,
} from "@mui/material";
import AppHeader from "./AppHeader";
import SideDrawer from "./SideDrawer";
import ChatHistory from "./ChatHistory";
import ChatInput from "./ChatInput";
import AuthForm from "./AuthForm";
import Settings, { models } from "./Settings";
import { animateScroll as scroll } from "react-scroll";
import readmeContent from "../README.md";

const MAX_CHAT_HISTORY_LENGTH = 20;
const MAX_CHATS = 5;

export const API_URL = process.env.NODE_ENV === "production" ? process.env.REACT_APP_API_URL : "http://localhost:5000";

function Main({ darkMode, toggleTheme }) {
    const [input, setInput] = useState("");
    const [pastedImage, setPastedImage] = useState(null);
    const [chatHistory, setChatHistory] = useState([]);
    const [storedChatHistories, setStoredChatHistories] = useState([]);
    const [isModelResponding, setIsModelResponding] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [sound, setSound] = useState(localStorage.getItem("sound") === "true");
    const [tools, setTools] = useState(localStorage.getItem("tools") === "true");
    const [temperature, setTemperature] = useState(Number(localStorage.getItem("temperature") || "0.5"));
    const [selectedModel, setSelectedModel] = useState(
        localStorage.getItem("selectedModel") || "gemini-1.5-pro-preview-0409"
    );
    const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem("token"));
    const [userEmail, setUserEmail] = useState(localStorage.getItem("userEmail") || "");
    const [openAuthModal, setOpenAuthModal] = useState(false);
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState("");
    const [snackbarSeverity, setSnackbarSeverity] = useState("info");
    const [openSettingsModal, setOpenSettingsModal] = useState(false);
    const [user, setUser] = useState(null);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    const [referrer, setReferrer] = useState("");

    const handleAuthentication = (token, email) => {
        localStorage.setItem("token", token);
        localStorage.setItem("userEmail", email);
        setUserEmail(email);
        setIsAuthenticated(true);
        setOpenAuthModal(false);
    };

    const handleOpenAuthModal = () => {
        setOpenAuthModal(true);
    };

    const handleCloseAuthModal = () => {
        setOpenAuthModal(false);
    };

    const handleFileSelect = (file) => {
        setSelectedFile(file);
    };

    useEffect(() => {
        const storedHistory = localStorage.getItem("chatHistory");
        const storedChatHistories = localStorage.getItem("storedChatHistories");

        if (storedHistory) {
            setChatHistory(JSON.parse(storedHistory));
        } else if (!storedChatHistories) {
            fetch(readmeContent)
                .then((res) => res.text())
                .then((text) => {
                    setChatHistory([{ user: "Who are you?", assistant: text }]);
                });
        }

        if (storedChatHistories) {
            setStoredChatHistories(JSON.parse(storedChatHistories));
        }
    }, []);

    useEffect(() => {
        try {
            scroll.scrollToBottom({
                containerId: "chatid",
                duration: 500,
                smooth: true,
            });
            if (chatHistory.length > 0) {
                const chatHistoryToStore = chatHistory.slice(-MAX_CHAT_HISTORY_LENGTH);
                localStorage.setItem("chatHistory", JSON.stringify(chatHistoryToStore));
            }
        } catch {}
    }, [chatHistory]);

    useEffect(() => {
        try {
            if (storedChatHistories.length > 0) {
                localStorage.setItem("storedChatHistories", JSON.stringify(storedChatHistories));
            }
            localStorage.setItem("sound", sound);
            localStorage.setItem("tools", tools);
            localStorage.setItem("temperature", temperature);
            localStorage.setItem("selectedModel", selectedModel);
        } catch {}
    }, [storedChatHistories, sound, temperature, tools, selectedModel]);

    useEffect(() => {
        fetchUserData();
        setReferrer(window.document.referrer);
    }, []);

    const handleSubmit = async () => {
        if (input.trim() || pastedImage || selectedFile) {
            let fileType = "";

            if (pastedImage || selectedFile) {
                const reader = new FileReader();
                reader.onload = () => {
                    const fileData = reader.result;
                    fileType = fileData.split(";")[0].split("/")[1];
                    const fileBytesBase64 = fileData.split(",")[1];
                    setPastedImage(null);
                    sendFileAndQuery(fileType, fileBytesBase64, input);
                };
                reader.readAsDataURL(pastedImage || selectedFile);
            } else {
                sendFileAndQuery("", "", input);
            }
        }
    };

    const sendFileAndQuery = async (fileType, fileBytesBase64, input, newHistory) => {
        try {
            const token = localStorage.getItem("token");
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            };

            setChatHistory([
                ...(newHistory || chatHistory),
                { user: input, assistant: null, fileType, userImageData: fileBytesBase64 },
            ]);
            setInput("");
            setIsModelResponding(true);

            const response = await fetch(API_URL + "/interact", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    input,
                    lang: (navigator.languages && navigator.languages[0]) || navigator.language,
                    fileType,
                    fileBytesBase64,
                    model: selectedModel,
                    referrer,
                    customGPT: localStorage.getItem("selectedCustomGPT"),
                    tools: models[selectedModel].includes("tools") && tools,
                    temperature,
                    chatHistory: (newHistory || chatHistory).map((h) => ({ user: h.user, assistant: h.assistant })),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const newChatHistory = [
                    ...(newHistory || chatHistory),
                    {
                        user: input,
                        assistant: data.textResponse,
                        toolsUsed: data.toolsUsed,
                        image: data.imageResponse,
                        fileType,
                        userImageData: fileBytesBase64,
                    },
                ];
                setChatHistory(newChatHistory);
                if (sound) {
                    const utterance = new SpeechSynthesisUtterance(data.textResponse);
                    window.speechSynthesis.speak(utterance);
                }
            } else if (response.status === 403) {
                setIsAuthenticated(false);
                setSnackbarMessage("Authentication failed. Please Login.");
                setSnackbarSeverity("error");
                setSnackbarOpen(true);
                localStorage.removeItem("token");
                localStorage.removeItem("userEmail");
                setUserEmail("");
                setIsAuthenticated(false);
                const newChatHistory = [
                    ...(newHistory || chatHistory),
                    { user: input, assistant: null, error: "Authentication failed." },
                ];
                setChatHistory(newChatHistory);
                setOpenAuthModal(true);
            } else {
                const data = await response.json();
                const newChatHistory = [
                    ...(newHistory || chatHistory),
                    { user: input, assistant: null, error: data.error },
                ];
                setChatHistory(newChatHistory);
            }
        } catch (error) {
            const newChatHistory = [
                ...(newHistory || chatHistory),
                { user: input, assistant: null, error: "Failed to connect to the server." },
            ];
            setChatHistory(newChatHistory);
        }

        setIsModelResponding(false);
        setSelectedFile(null);
        setPastedImage(null);
    };

    const generateChatSummary = async (chatHistory) => {
        const token = localStorage.getItem("token");
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        };

        const response = await fetch(API_URL + "/interact", {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: "gemini-1.0-pro",
                temperature: 0.1,
                referrer,
                input: "Extract main topic of this chat in one simple short statement without formatting (30 chars max) and return it without anything else in [] ",
                chatHistory: chatHistory.map((h) => ({ user: h.user, assistant: h.assistant })),
            }),
        });

        if (response?.ok) {
            const data = await response.json();
            return data?.textResponse?.trim();
        } else {
            const messages = chatHistory.map((chat) => chat.user + (chat.assistant || ""));
            const summary = messages.join(" ").slice(0, 30);
            return summary;
        }
    };

    const toggleDrawer = () => {
        setDrawerOpen(!drawerOpen);
    };

    const clearAllChatHistory = () => {
        setChatHistory([]);
        setStoredChatHistories([]);
        localStorage.removeItem("chatHistory");
        localStorage.removeItem("storedChatHistories");
        setDrawerOpen(false);
        setSelectedFile(null);
    };

    const handleNewChat = () => {
        if (chatHistory.length > 0) {
            Promise.resolve().then(async () => {
                const summary = await generateChatSummary(chatHistory);
                setStoredChatHistories([{ chatHistory, summary }, ...storedChatHistories.slice(0, MAX_CHATS - 1)]);
            });
        }
        setChatHistory([]);
        localStorage.removeItem("chatHistory");
        setDrawerOpen(false);
        setSelectedFile(null);
    };

    const handleHistorySelection = (index) => {
        const updatedStoredChatHistories = [...storedChatHistories];
        if (updatedStoredChatHistories.length >= MAX_CHATS) {
            updatedStoredChatHistories.shift();
        }
        Promise.resolve().then(async () => {
            const summary = await generateChatSummary(chatHistory);
            updatedStoredChatHistories[index] = { chatHistory, summary };
            setStoredChatHistories(updatedStoredChatHistories);
        });
        setChatHistory(storedChatHistories[index].chatHistory);
        setDrawerOpen(false);
    };

    const handleSignOut = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("userEmail");
        setUserEmail("");
        setIsAuthenticated(false);
    };

    const handleSnackbarClose = () => {
        setSnackbarOpen(false);
    };

    const handleSettings = async () => {
        await fetchUserData();
        setOpenSettingsModal(true);
    };

    const handleCloseSettingsModal = () => {
        setOpenSettingsModal(false);
    };

    const handleRun = async (language, program) => {
        if (language !== "python") {
            return;
        }
        try {
            const token = localStorage.getItem("token");
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            };

            setChatHistory([...chatHistory, { user: "🏃", assistant: null }]);
            setIsModelResponding(true);

            const response = await fetch(API_URL + "/run", {
                method: "POST",
                headers,
                body: JSON.stringify({ program }),
            });

            const data = await response.json();
            if (response.ok) {
                setChatHistory([
                    ...chatHistory,
                    {
                        user: "🏃",
                        assistant: data.output,
                        image: data.imageResponse,
                    },
                ]);
            } else {
                setChatHistory([
                    ...chatHistory,
                    {
                        user: "🏃",
                        assistant: null,
                        error: data.error,
                    },
                ]);
            }
        } catch (error) {
            const newChatHistory = [
                ...chatHistory,
                { user: "🏃", assistant: null, error: "Failed to connect to the server or server timeout" },
            ];
            setChatHistory(newChatHistory);
        }
        setIsModelResponding(false);
    };

    const handleChange = async (newHistory, index) => {
        sendFileAndQuery(null, null, newHistory[index].user, newHistory.slice(0, index));
    };

    const handleDelete = async (newHistory) => {
        setChatHistory(newHistory);
    };

    const fetchUserData = async () => {
        const token = localStorage.getItem("token");
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        };

        const response = await fetch(`${API_URL}/user`, {
            method: "GET",
            headers,
        });

        if (response.ok) {
            const userData = await response.json();
            setUser(userData);
        }
    };

    const handleCancelSubscription = async () => {
        setShowConfirmationModal(true);
    };

    const confirmCancelSubscription = async () => {
        const token = localStorage.getItem("token");
        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        };

        const response = await fetch(`${API_URL}/cancel`, {
            method: "POST",
            headers,
            body: JSON.stringify({ subscriptionId: user.subscriptionId }),
        });

        if (response.ok) {
            setSnackbarMessage("Subscription canceled successfully");
            setSnackbarSeverity("success");
            setSnackbarOpen(true);
            fetchUserData();
        } else {
            const error = await response.json();
            setSnackbarMessage(`Error canceling subscription: ${error.error}`);
            setSnackbarSeverity("error");
            setSnackbarOpen(true);
        }

        setShowConfirmationModal(false);
    };

    return (
        <>
            <AppHeader
                isAuthenticated={isAuthenticated}
                userEmail={userEmail}
                onSignOut={handleSignOut}
                onSettings={handleSettings}
                onOpenAuthModal={handleOpenAuthModal}
                onToggle={toggleDrawer}
                selectedModel={selectedModel}
                onModelSelect={setSelectedModel}
                darkMode={darkMode}
                toggleTheme={toggleTheme}
            />
            <SideDrawer
                isOpen={drawerOpen}
                onToggle={toggleDrawer}
                onNewChat={handleNewChat}
                storedChatHistories={storedChatHistories}
                chatHistory={chatHistory}
                onHistorySelection={handleHistorySelection}
                sound={sound}
                tools={tools}
                toolsEnabled={models[selectedModel].includes("tools")}
                onSoundChange={setSound}
                onToolsChange={setTools}
                onClearAll={clearAllChatHistory}
                temperature={temperature}
                onTemperatureChange={setTemperature}
                admin={user?.admin}
            />
            <Dialog open={openAuthModal} onClose={handleCloseAuthModal}>
                <DialogContent>
                    <AuthForm onAuthentication={handleAuthentication} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAuthModal}>Cancel</Button>
                </DialogActions>
            </Dialog>
            <Dialog open={openSettingsModal} onClose={handleCloseSettingsModal} maxWidth="md" fullWidth>
                <DialogContent>
                    {user && (
                        <Settings
                            handleCloseSettingsModal={handleCloseSettingsModal}
                            handleCancelSubscription={handleCancelSubscription}
                            user={user}
                            selectedModel={selectedModel}
                            onModelSelect={setSelectedModel}
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseSettingsModal}>Close</Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={showConfirmationModal}
                style={{
                    border: "1px solid #ccc",
                    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
                    borderRadius: "8px",
                    padding: "24px",
                }}
            >
                <Box display="flex" flexDirection="column" alignItems="center" textAlign="center" p={4} m={2}>
                    <Typography variant="h6" gutterBottom>
                        Confirm Cancellation
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                        Are you sure you want to cancel your subscription?
                    </Typography>
                    <Box mt={2}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={confirmCancelSubscription}
                            style={{ marginRight: "8px" }}
                        >
                            Yes
                        </Button>
                        <Button variant="outlined" color="primary" onClick={() => setShowConfirmationModal(false)}>
                            No
                        </Button>
                    </Box>
                </Box>
            </Dialog>
            <Container
                maxWidth="lg"
                sx={isMobile ? { m: 0, p: 0 } : {}}
                style={{ display: "flex", flexDirection: "column", height: "91vh", flexGrow: 1 }}
            >
                <ChatHistory
                    onChange={handleChange}
                    onDelete={handleDelete}
                    onRun={handleRun}
                    chatHistory={chatHistory}
                    isModelResponding={isModelResponding}
                />
                <ChatInput
                    input={input}
                    setInput={setInput}
                    selectedFile={selectedFile}
                    selectedModel={selectedModel}
                    onFileSelect={handleFileSelect}
                    onSubmit={handleSubmit}
                    pastedImage={pastedImage}
                    setPastedImage={setPastedImage}
                />
            </Container>
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={handleSnackbarClose}
                message={snackbarMessage}
                severity={snackbarSeverity}
            />
        </>
    );
}

export default Main;
