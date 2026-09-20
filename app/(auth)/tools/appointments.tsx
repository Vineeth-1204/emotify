import React, { useState, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert, Animated, Platform } from "react-native";
import { useRouter } from "expo-router";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAppAuth } from "@/utils/auth";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/context/MoodThemeContext";
import { Calendar } from "react-native-calendars";
import { MitraAvatar } from "@/components/avatar/MitraAvatar";

const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

const TimeScroller = ({ selectedTime, onTimeChange, colors }: { selectedTime: string, onTimeChange: (val: string) => void, colors: any }) => {
  const [hour, setHour] = React.useState("10");
  const [minute, setMinute] = React.useState("00");
  const [period, setPeriod] = React.useState("AM");

  React.useEffect(() => {
    if (selectedTime) {
      const parts = selectedTime.split(/[: ]/);
      if (parts.length === 3) {
        setHour(parts[0]);
        setMinute(parts[1]);
        setPeriod(parts[2]);
      }
    } else {
      onTimeChange(`${hour}:${minute} ${period}`);
    }
  }, []);

  const updateTime = (h: string, m: string, p: string) => {
    setHour(h); setMinute(m); setPeriod(p);
    onTimeChange(`${h}:${m} ${p}`);
  };

  const CLOCK_SIZE = 140;
  const CENTER = CLOCK_SIZE / 2;
  const RADIUS = CLOCK_SIZE / 2 - 16;

  const renderHours = () => {
    return Array.from({ length: 12 }, (_, i) => i + 1).map((h) => {
      const angle = (h / 12) * Math.PI * 2;
      const x = CENTER + RADIUS * Math.sin(angle) - 14;
      const y = CENTER - RADIUS * Math.cos(angle) - 14;
      const hStr = h.toString().padStart(2, '0');
      const isSelected = hour === hStr;

      return (
        <TouchableOpacity
          key={`h-${h}`}
          onPress={() => updateTime(hStr, minute, period)}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: isSelected ? colors.primary : 'transparent',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: isSelected ? '#fff' : colors.text, fontWeight: isSelected ? 'bold' : 'normal', fontSize: 12 }}>{h}</Text>
        </TouchableOpacity>
      );
    });
  };

  const renderMinutes = () => {
    // Show 00, 05, 10, 15... 55
    return Array.from({ length: 12 }, (_, i) => i * 5).map((m) => {
      const angle = (m / 60) * Math.PI * 2;
      const x = CENTER + RADIUS * Math.sin(angle) - 14;
      const y = CENTER - RADIUS * Math.cos(angle) - 14;
      const mStr = m.toString().padStart(2, '0');
      const isSelected = minute === mStr;

      return (
        <TouchableOpacity
          key={`m-${m}`}
          onPress={() => updateTime(hour, mStr, period)}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: isSelected ? colors.primary : 'transparent',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: isSelected ? '#fff' : colors.text, fontWeight: isSelected ? 'bold' : 'normal', fontSize: 12 }}>{mStr}</Text>
        </TouchableOpacity>
      );
    });
  };

  const renderClock = (type: "hour" | "minute") => {
    let angle = 0;
    if (type === "hour") {
      angle = (parseInt(hour, 10) / 12) * Math.PI * 2;
    } else {
      angle = (parseInt(minute, 10) / 60) * Math.PI * 2;
    }

    return (
      <View style={{ width: CLOCK_SIZE, height: CLOCK_SIZE, borderRadius: CLOCK_SIZE / 2, backgroundColor: colors.surface, position: 'relative' }}>
        {/* Hand Line */}
        <View style={{ 
          position: 'absolute', 
          left: CENTER - 1, 
          top: CENTER - RADIUS, 
          width: 2, 
          height: RADIUS, 
          backgroundColor: colors.primary,
          transform: [
            { translateY: RADIUS / 2 },
            { rotate: `${angle}rad` },
            { translateY: -RADIUS / 2 }
          ]
        }} />
        
        {/* Center Dot */}
        <View style={{ position: 'absolute', top: CENTER - 4, left: CENTER - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
        
        {type === "hour" ? renderHours() : renderMinutes()}
      </View>
    );
  };

  return (
    <View style={{ alignItems: 'center', marginBottom: 20 }}>
      {/* Time Display */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 20 }}>
        <Text style={{ fontSize: 32, fontWeight: 'bold', color: colors.text }}>{hour}:{minute}</Text>
        <View style={{ flexDirection: 'row', marginLeft: 16, backgroundColor: colors.surface, borderRadius: 8, overflow: 'hidden' }}>
          <TouchableOpacity 
            onPress={() => updateTime(hour, minute, "AM")}
            style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: period === "AM" ? colors.primary : 'transparent' }}
          >
            <Text style={{ color: period === "AM" ? '#fff' : colors.text, fontWeight: 'bold' }}>AM</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => updateTime(hour, minute, "PM")}
            style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: period === "PM" ? colors.primary : 'transparent' }}
          >
            <Text style={{ color: period === "PM" ? '#fff' : colors.text, fontWeight: 'bold' }}>PM</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Clocks side by side */}
      <View style={{ flexDirection: 'column', gap: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.textMuted, marginBottom: 8, fontWeight: '600' }}>Hour</Text>
          {renderClock("hour")}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.textMuted, marginBottom: 8, fontWeight: '600' }}>Minute</Text>
          {renderClock("minute")}
        </View>
      </View>
    </View>
  );
};

type TabStatus = "pending" | "waiting" | "accepted" | "rejected" | "completed";

export default function AppointmentsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAppAuth();
  const clerkId = user?.id || "";

  const dbUser = useQuery(api.users.getByClerkId, { clerkId });

  // Pagination Query
  const {
    results: appointments,
    status: queryStatus,
    loadMore
  } = usePaginatedQuery(
    api.appointments.getTwoWayAppointmentsForPatientPaginated,
    { userId: clerkId },
    { initialNumItems: 20 }
  );

  const createAppointment = useMutation(api.appointments.createAppointmentRequest);
  const updateStatus = useMutation(api.appointments.updateAppointmentStatus);
  const requestReschedule = useMutation(api.appointments.requestReschedule);
  const completeAppointment = useMutation(api.appointments.completeAppointment);
  const deleteAppointment = useMutation(api.appointments.deleteAppointment);

  // UI State
  const [activeTab, setActiveTab] = useState<TabStatus>("pending");
  const [selectedAppt, setSelectedAppt] = useState<any>(null);
  const [celebrating, setCelebrating] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showAttendancePrompt, setShowAttendancePrompt] = useState(false);

  // Form State - Create
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  // Form State - Reject
  const [rejectionReason, setRejectionReason] = useState("");

  // Form State - Reschedule
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  // Form State - Complete
  const [rating, setRating] = useState("5");
  const [feedback, setFeedback] = useState("");

  const filtered = useMemo(() => {
    if (!appointments) return [];
    return appointments.filter((a: any) => a.status === activeTab);
  }, [appointments, activeTab]);

  const handleDelete = async (appointmentId: Id<"appointments">) => {
    Alert.alert("Delete Appointment", "Are you sure you want to delete this request?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await deleteAppointment({ appointmentId });
          setShowDetail(false);
        } catch (err: any) {
          Alert.alert("Error", err.message);
        }
      }}
    ]);
  };

  const handleCreate = async () => {
    if (!title || !reason || !selectedDate || !selectedTime) {
      Alert.alert("Error", "Please provide a title, date, time, and reason.");
      return;
    }
    if (!dbUser) return;
    try {
      await createAppointment({
        userId: dbUser._id,
        title,
        createdBy: "user",
        date: selectedDate,
        time: selectedTime,
        reason,
      });
      setShowCreate(false);
      setTitle(""); setReason(""); setSelectedDate(""); setSelectedTime("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const triggerCelebration = () => {
    setCelebrating(true);
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.2, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true })
    ]).start(() => {
      setTimeout(() => {
        setCelebrating(false);
      }, 1500);
    });
  };

  const handleAccept = async () => {
    if (!selectedAppt) return;
    try {
      await updateStatus({ appointmentId: selectedAppt._id, status: "accepted" });
      setShowDetail(false);
      triggerCelebration();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason) {
      Alert.alert("Error", "Reason is required.");
      return;
    }
    try {
      await updateStatus({ appointmentId: selectedAppt._id, status: "rejected", rejectionReason });
      setShowReject(false);
      setShowDetail(false);
      setRejectionReason("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleTime || !rescheduleDate) {
      Alert.alert("Error", "Please provide the new time and date.");
      return;
    }
    try {
      await requestReschedule({
        appointmentId: selectedAppt._id,
        newTime: rescheduleTime,
        newDate: rescheduleDate
      });
      setShowReschedule(false);
      setShowDetail(false);
      setRescheduleTime("");
      setRescheduleDate("");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleComplete = async () => {
    try {
      await completeAppointment({
        appointmentId: selectedAppt._id,
        attended: "yes",
        rating: parseInt(rating),
        feedback
      });
      setShowComplete(false);
      setShowDetail(false);
      
      // Give feedback response based on rating
      const r = parseInt(rating);
      if (r >= 4) {
        Alert.alert("Thank you!", "We're thrilled you had a great session!");
      } else if (r === 3) {
        Alert.alert("Thank you", "Thanks for your feedback, we'll keep improving.");
      } else {
        Alert.alert("We're sorry", "We appreciate your feedback and will use it to make things better.");
      }
      
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const renderCloseButton = (onPress: () => void) => (
    <TouchableOpacity onPress={onPress} style={styles.closeButton}>
      <Ionicons name="close" size={24} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.text }]}>Appointments</Text>
          <TouchableOpacity onPress={() => setShowCreate(true)} style={[styles.createBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* CELEBRATION OVERLAY */}
      {celebrating && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background + 'EE' }]}>
           <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center', backgroundColor: colors.surface, padding: 32, borderRadius: 24, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 }}>
             <View style={{ marginBottom: 16 }}>
               <MitraAvatar state="celebrating" size="md" />
             </View>
             <Text style={{ fontSize: 28, fontWeight: 'bold', color: colors.primary, marginBottom: 20 }}>Confirmed!</Text>
             {selectedAppt && (
               <View style={{ alignItems: 'center', backgroundColor: colors.background, padding: 16, borderRadius: 12, width: '100%' }}>
                 <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 8 }}>{selectedAppt.title}</Text>
                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                   <Ionicons name="calendar" size={18} color={colors.primary} />
                   <Text style={{ fontSize: 16, color: colors.textSecondary }}>{selectedAppt.date}</Text>
                 </View>
                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                   <Ionicons name="time" size={18} color={colors.primary} />
                   <Text style={{ fontSize: 16, color: colors.textSecondary }}>{selectedAppt.time}</Text>
                 </View>
               </View>
             )}
           </Animated.View>
        </View>
      )}

      {/* TABS */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
          {(["pending", "waiting", "accepted", "rejected", "completed"] as TabStatus[]).map(tab => (
            <TouchableOpacity 
              key={tab} 
              onPress={() => setActiveTab(tab)}
              style={[styles.tabBtn, activeTab === tab ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface }]}
            >
              <Text style={{ color: activeTab === tab ? '#fff' : colors.text, fontWeight: '600', textTransform: 'capitalize' }}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* LIST */}
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {queryStatus === "LoadingFirstPage" ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : filtered.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 40 }}>No {activeTab} appointments.</Text>
        ) : (
          <>
            {filtered.map((appt: any) => {
              return (
                <AppointmentCard key={appt._id} appt={appt} colors={colors} styles={styles} handleDelete={handleDelete} setSelectedAppt={setSelectedAppt} setShowDetail={setShowDetail} />
              )
            })}
            {queryStatus === "CanLoadMore" && (
              <TouchableOpacity onPress={() => loadMore(20)} style={{ padding: 10 }}>
                <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '600' }}>Load More</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* 1. CREATE MODAL */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, maxHeight: '90%' }]}>
            {renderCloseButton(() => setShowCreate(false))}
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Appointment</Text>
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
              <TextInput placeholder="Title (e.g. Follow up)" value={title} onChangeText={setTitle} style={[styles.input, { backgroundColor: colors.background, color: colors.text, marginBottom: 0 }]} placeholderTextColor={colors.textMuted} />
              
              <View>
                <Text style={{ color: colors.text, marginBottom: 8, fontWeight: '600' }}>Select Date:</Text>
                <Calendar
                  onDayPress={(day: any) => setSelectedDate(day.dateString)}
                  markedDates={{
                    [selectedDate]: { selected: true, selectedColor: colors.primary }
                  }}
                  theme={{
                    calendarBackground: colors.background,
                    textSectionTitleColor: colors.textMuted,
                    dayTextColor: colors.text,
                    todayTextColor: colors.primary,
                    selectedDayTextColor: '#ffffff',
                    monthTextColor: colors.text,
                    arrowColor: colors.primary,
                  }}
                  style={{ borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', marginBottom: 16 }}
                />

                <Text style={{ color: colors.text, marginBottom: 8, fontWeight: '600' }}>Select Time:</Text>
                <TimeScroller selectedTime={selectedTime} onTimeChange={setSelectedTime} colors={colors} />
              </View>

              <TextInput placeholder="Reason for visit" value={reason} onChangeText={setReason} multiline style={[styles.input, { height: 80, backgroundColor: colors.background, color: colors.text, marginBottom: 0 }]} placeholderTextColor={colors.textMuted} />
              
              <TouchableOpacity onPress={handleCreate} style={[styles.btn, { backgroundColor: colors.primary, marginTop: 10 }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Submit Request</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 2. VIEW DETAIL MODAL */}
      <Modal visible={showDetail} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {renderCloseButton(() => setShowDetail(false))}
            
            {selectedAppt && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text, marginRight: 24 }]}>{selectedAppt.title}</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary }}>{selectedAppt.date} at {selectedAppt.time}</Text>
                </View>

                <View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 8, marginBottom: 20 }}>
                  <Text style={{ color: colors.text }}>{selectedAppt.reason}</Text>
                </View>

                {/* Handshake Logic */}
                {selectedAppt.status === 'pending' && selectedAppt.createdBy === 'admin' && (
                  <View style={{ gap: 10 }}>
                    <TouchableOpacity onPress={handleAccept} style={[styles.btn, { backgroundColor: colors.success || '#10b981' }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Accept Appointment</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { setShowDetail(false); setRescheduleDate(selectedAppt.date); setShowReschedule(true); }} style={[styles.btn, { backgroundColor: colors.surface }]}><Text style={{ color: colors.text, fontWeight: '600' }}>Request Reschedule</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { setShowDetail(false); setShowReject(true); }} style={[styles.btn, { backgroundColor: colors.error || '#ef4444' }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Reject</Text></TouchableOpacity>
                  </View>
                )}
                
                {selectedAppt.status === 'pending' && selectedAppt.createdBy === 'user' && (
                  <Text style={{ color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' }}>Awaiting admin confirmation...</Text>
                )}

                {/* Reschedule Handshake */}
                {selectedAppt.status === 'waiting' && selectedAppt.rescheduledBy === 'admin' && (
                  <View style={{ gap: 10 }}>
                     <Text style={{ color: colors.text, textAlign: 'center', marginBottom: 8 }}>Admin requested a new time: {selectedAppt.rescheduleDate} at {selectedAppt.rescheduleTime}</Text>
                     <TouchableOpacity onPress={handleAccept} style={[styles.btn, { backgroundColor: colors.success || '#10b981' }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Accept New Time</Text></TouchableOpacity>
                     <TouchableOpacity onPress={() => { setShowDetail(false); setShowReject(true); }} style={[styles.btn, { backgroundColor: colors.error || '#ef4444' }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Reject</Text></TouchableOpacity>
                  </View>
                )}
                {selectedAppt.status === 'waiting' && selectedAppt.rescheduledBy === 'user' && (
                  <Text style={{ color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' }}>Awaiting admin to confirm your requested reschedule time...</Text>
                )}

                {selectedAppt.status === 'completed' && !selectedAppt.rating && (
                  <TouchableOpacity onPress={() => { setShowDetail(false); setShowComplete(true); }} style={[styles.btn, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Rate Session</Text></TouchableOpacity>
                )}

                {selectedAppt.status === 'rejected' && (
                  <View style={{ backgroundColor: (colors.error || '#ef4444') + '15', padding: 12, borderRadius: 8 }}>
                    <Text style={{ color: colors.error || '#ef4444', fontWeight: 'bold' }}>Rejected:</Text>
                    <Text style={{ color: colors.text }}>{selectedAppt.rejectionReason}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 3. REJECT MODAL */}
      <Modal visible={showReject} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {renderCloseButton(() => setShowReject(false))}
            <Text style={[styles.modalTitle, { color: colors.error || '#ef4444' }]}>Reject Appointment</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Please provide a reason for rejecting this appointment. This is mandatory.</Text>
            <TextInput placeholder="Reason for rejection" value={rejectionReason} onChangeText={setRejectionReason} multiline style={[styles.input, { height: 80, backgroundColor: colors.background, color: colors.text }]} placeholderTextColor={colors.textMuted} />
            <TouchableOpacity onPress={handleReject} style={[styles.btn, { backgroundColor: colors.error || '#ef4444', marginTop: 10 }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Confirm Reject</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 4. RESCHEDULE MODAL */}
      <Modal visible={showReschedule} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, maxHeight: '90%' }]}>
            {renderCloseButton(() => setShowReschedule(false))}
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reschedule</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Reschedules must be requested for the same day ({selectedAppt?.date}).</Text>
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
              <View>
                <Text style={{ color: colors.text, marginBottom: 8, fontWeight: '600' }}>Select New Date:</Text>
                <Calendar
                  current={selectedAppt?.date}
                  minDate={selectedAppt?.date}
                  maxDate={selectedAppt?.date}
                  disableAllTouchEventsForDisabledDays={true}
                  onDayPress={(day: any) => setRescheduleDate(day.dateString)}
                  markedDates={{
                    [rescheduleDate]: { selected: true, selectedColor: colors.primary }
                  }}
                  theme={{
                    calendarBackground: colors.background,
                    textSectionTitleColor: colors.textMuted,
                    dayTextColor: colors.text,
                    todayTextColor: colors.primary,
                    selectedDayTextColor: '#ffffff',
                    monthTextColor: colors.text,
                    arrowColor: colors.primary,
                  }}
                  style={{ borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', marginBottom: 16 }}
                />

                <Text style={{ color: colors.text, marginBottom: 8, fontWeight: '600' }}>Select New Time:</Text>
                <TimeScroller selectedTime={rescheduleTime} onTimeChange={setRescheduleTime} colors={colors} />
              </View>

              <TouchableOpacity onPress={handleReschedule} style={[styles.btn, { backgroundColor: colors.primary, marginTop: 10 }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Submit New Time</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 5. COMPLETE MODAL */}
      <Modal visible={showComplete} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {renderCloseButton(() => setShowComplete(false))}
            <Text style={[styles.modalTitle, { color: colors.text }]}>Complete Session</Text>
            
            <Text style={{ color: colors.text, marginBottom: 8, fontWeight: '600' }}>Rate your session</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star.toString())}>
                  <Ionicons 
                    name={parseInt(rating) >= star ? "star" : "star-outline"} 
                    size={40} 
                    color="#F59E0B" 
                  />
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={{ color: colors.text, marginBottom: 8, fontWeight: '600' }}>Feedback</Text>
            <TextInput placeholder="How did the session go?" value={feedback} onChangeText={setFeedback} multiline style={[styles.input, { height: 80, backgroundColor: colors.background, color: colors.text }]} placeholderTextColor={colors.textMuted} />
            
            <TouchableOpacity onPress={handleComplete} style={[styles.btn, { backgroundColor: colors.success || '#10b981', marginTop: 10 }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

function AppointmentCard({ appt, colors, styles, handleDelete, setSelectedAppt, setShowDetail }: any) {
  const [timeLeftStr, setTimeLeftStr] = useState("");

  useEffect(() => {
    if (appt.status !== 'accepted') return;
    
    const updateTimer = () => {
      try {
        const match = appt.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        let timeMs = 0;
        if (match) {
          let [_, hours, mins, modifier] = match;
          let h = parseInt(hours, 10);
          if (modifier.toUpperCase() === 'PM' && h < 12) h += 12;
          if (modifier.toUpperCase() === 'AM' && h === 12) h = 0;
          const d = new Date(`${appt.date}T${h.toString().padStart(2, '0')}:${mins}:00`);
          timeMs = d.getTime();
        } else {
          timeMs = new Date(`${appt.date} ${appt.time}`).getTime();
        }

        const diff = timeMs - Date.now();
        if (diff > 0) {
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const m = Math.floor((diff / 1000 / 60) % 60);
          const s = Math.floor((diff / 1000) % 60);
          let str = "Starts in ";
          if (d > 0) str += `${d}d `;
          str += `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
          setTimeLeftStr(str);
        } else {
          setTimeLeftStr("Started");
        }
      } catch(e) {}
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [appt.date, appt.time, appt.status]);

  return (
    <TouchableOpacity 
      onPress={() => { setSelectedAppt(appt); setShowDetail(true); }}
      style={[styles.card, { backgroundColor: colors.surface, position: 'relative' }]}
    >
      {(appt.status === 'pending' || appt.status === 'rejected') && (
        <TouchableOpacity 
          onPress={() => handleDelete(appt._id)}
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 4 }}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error || '#ef4444'} />
        </TouchableOpacity>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingRight: (appt.status === 'pending' || appt.status === 'rejected') ? 30 : 0 }}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{appt.title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{appt.date}</Text>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
        <Ionicons name="time-outline" size={16} color={colors.primary} />
        <Text style={{ color: colors.textSecondary }}>{appt.time}</Text>
      </View>
      
      {appt.status === 'accepted' && timeLeftStr && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
          <Ionicons name="timer-outline" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{timeLeftStr}</Text>
        </View>
      )}

      {appt.status === 'rejected' && appt.rejectionReason && (
        <View style={{ backgroundColor: (colors.error || '#ef4444') + '15', padding: 8, borderRadius: 6, marginTop: 10 }}>
          <Text style={{ color: colors.error || '#ef4444', fontSize: 13 }}><Text style={{ fontWeight: 'bold' }}>Reason:</Text> {appt.rejectionReason}</Text>
        </View>
      )}

      {appt.status === 'completed' && appt.rating && (
        <View style={{ backgroundColor: colors.background, padding: 8, borderRadius: 6, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', gap: 2, marginBottom: 4 }}>
              {[1,2,3,4,5].map(s => (
                <Ionicons key={s} name={appt.rating >= s ? "star" : "star-outline"} size={14} color="#F59E0B" />
              ))}
            </View>
            {appt.feedback && <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>"{appt.feedback}"</Text>}
        </View>
      )}

      {appt.status === 'waiting' && (
          <Text style={{ color: colors.warning, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
            Rescheduled to {appt.rescheduleDate} at {appt.rescheduleTime}
          </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontWeight: 'bold' },
  createBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tabsContainer: { paddingVertical: 10 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  card: { padding: 16, borderRadius: 16, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 20, padding: 24, paddingTop: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, position: 'relative' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: { padding: 12, borderRadius: 10, marginBottom: 12 },
  btn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  closeButton: { position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 4 }
});
