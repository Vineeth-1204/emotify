import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useAppAuth } from "@/utils/auth";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import { Theme } from "@/constants/Theme";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function RegisterScreen() {
  const { register } = useAppAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  }, []);

  async function handleRegister() {
    const cleanName = fullName.trim();
    const cleanMobile = mobileNumber.replace(/\D/g, "");
    const cleanEmail = email.trim();

    if (!cleanName || cleanName.length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }

    if (cleanMobile.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await register({
        full_name: cleanName,
        mobile_number: cleanMobile,
        password,
        email: cleanEmail || undefined,
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else {
        // Successful registration sets auth context and routes to onboarding
        router.replace("/(auth)/onboarding/welcome" as any);
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      setError(err.message || "Failed to create account. Please try again.");
      setLoading(false);
    }
  }

  const isFormValid =
    fullName.trim().length >= 2 &&
    mobileNumber.replace(/\D/g, "").length === 10 &&
    password.length >= 6 &&
    confirmPassword.length >= 6;

  return (
    <View style={styles.container}>
      {/* Calm, warm white and soft gradient background */}
      <LinearGradient
        colors={["#FAF9F5", "#EBF5FF", "#F3E8FF"] as any}
        style={StyleSheet.absoluteFill}
      />

      {/* Gentle, calm ambient visual elements */}
      <View style={[styles.softBlob, { top: -80, right: -80, backgroundColor: "#E0F2FE", opacity: 0.8 }]} />
      <View style={[styles.softBlob, { bottom: -100, left: -100, backgroundColor: "#E8F0EC", opacity: 0.8 }]} />
      <View style={[styles.softBlob, { top: "45%", left: -120, width: 240, height: 240, backgroundColor: "#F3E8FF", opacity: 0.5 }]} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(36, insets.top + 10),
              paddingBottom: Math.max(40, insets.bottom + 20),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Top Navigation Row */}
            <View style={styles.topBar}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={20} color="#334155" />
              </TouchableOpacity>
            </View>

            {/* Header */}
            <View style={styles.hero}>
              <View style={styles.logoWrapper}>
                <LinearGradient
                  colors={["#A7F3D0", "#93C5FD"] as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoCircle}
                >
                  <Ionicons name="person-add-outline" size={32} color="#1E293B" />
                </LinearGradient>
              </View>
              <Text style={styles.title}>Create Student Account</Text>
              <Text style={styles.subtitle}>
                Begin your journey with your private, confidential mental health companion.
              </Text>
            </View>

            {/* Form Card */}
            <View style={styles.card}>
              {/* Full Name */}
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={fullName}
                  onChangeText={(val) => {
                    setFullName(val);
                    if (error) setError("");
                  }}
                  placeholder="e.g. Maya Sharma"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>

              {/* Mobile Number */}
              <Text style={styles.inputLabel}>Mobile Number (Login Identifier)</Text>
              <View style={styles.inputBox}>
                <Ionicons name="call-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={mobileNumber}
                  onChangeText={(val) => {
                    setMobileNumber(val.replace(/\D/g, ""));
                    if (error) setError("");
                  }}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Optional Email */}
              <Text style={styles.inputLabel}>Email Address (Optional)</Text>
              <View style={styles.inputBox}>
                <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (error) setError("");
                  }}
                  placeholder="student@college.edu"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <Text style={styles.inputLabel}>Password (Min. 6 characters)</Text>
              <View style={styles.inputBox}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (error) setError("");
                  }}
                  placeholder="Create a strong password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Confirm Password */}
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <View style={styles.inputBox}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={confirmPassword}
                  onChangeText={(val) => {
                    setConfirmPassword(val);
                    if (error) setError("");
                  }}
                  placeholder="Confirm password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Error Message */}
              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryButton, (!isFormValid || loading) && styles.disabledButton]}
                onPress={handleRegister}
                disabled={!isFormValid || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FAF9F5" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              {/* Existing Account Link */}
              <TouchableOpacity
                style={styles.switchAuthRow}
                onPress={() => router.push("/(public)/login" as any)}
                activeOpacity={0.7}
              >
                <Text style={styles.switchAuthText}>
                  Already have an account?{" "}
                  <Text style={styles.switchAuthHighlight}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Privacy note */}
            <View style={styles.footer}>
              <Ionicons name="lock-closed" size={13} color="#94A3B8" />
              <Text style={styles.footerText}>
                Your data is strictly encrypted and protected by student privacy standards.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  softBlob: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    zIndex: 0,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  content: {
    width: "100%",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Theme.shadows.tertiary,
  },
  hero: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 4,
  },
  logoWrapper: {
    marginBottom: 12,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 24,
    color: "#0F172A",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 4,
  },
  inputLabel: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: "#475569",
    marginBottom: 6,
    marginLeft: 2,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontFamily: Theme.fontFamily.medium,
    fontSize: 15,
    color: "#0F172A",
  },
  eyeIcon: {
    padding: 6,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    flex: 1,
    fontFamily: Theme.fontFamily.medium,
    fontSize: 13,
    color: "#EF4444",
  },
  primaryButton: {
    backgroundColor: "#4F46E5", // Indigo theme
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 6,
  },
  disabledButton: {
    backgroundColor: "#CBD5E1",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontFamily: Theme.fontFamily.bold,
    fontSize: 16,
    color: "#FAF9F5",
  },
  switchAuthRow: {
    marginTop: 18,
    alignItems: "center",
    paddingVertical: 4,
  },
  switchAuthText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 14,
    color: "#475569",
  },
  switchAuthHighlight: {
    fontFamily: Theme.fontFamily.bold,
    color: "#4F46E5",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 16,
  },
  footerText: {
    fontFamily: Theme.fontFamily.medium,
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 16,
  },
});
