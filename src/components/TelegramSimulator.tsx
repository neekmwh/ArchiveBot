/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { DbStore } from '../dbStore';
import { User, DocumentDraft, Project, CustodyTransfer } from '../types';
import { 
  Send, Smartphone, UserCheck, Bot, FileText, Check, X, 
  HelpCircle, AlertTriangle, ShieldCheck, ShieldAlert, Sparkles, 
  Trash2, ArrowLeft, RefreshCw, Layers
} from 'lucide-react';

interface TelegramSimulatorProps {
  tenantId: string;
  refreshDb: () => void;
  botSimUser: User | null;
  onSetBotSimUser: (user: User) => void;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  buttons?: string[][]; // Multi-row reply keyboard
  inlineButtons?: { text: string; callback: string }[][]; // Inline callback buttons
  fileUploadSim?: boolean;
}

export default function TelegramSimulator({ 
  tenantId, 
  refreshDb, 
  botSimUser, 
  onSetBotSimUser 
}: TelegramSimulatorProps) {
  
  const dbData = DbStore.load();
  const allUsers = DbStore.getUsers(tenantId);
  const activeProjects = DbStore.getProjects(tenantId).filter(p => p.status === 'ACTIVE');

  // Simulator States
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  
  // OTP Auth simulator
  const [otpSentCode, setOtpSentCode] = useState<string | null>(null);
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null);
  const [pairingPhone, setPairingPhone] = useState<string | null>(null);

  // Active Draft state
  const [activeDraft, setActiveDraft] = useState<DocumentDraft | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileContent, setUploadedFileContent] = useState('');
  const [isVirusInfected, setIsVirusInfected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isScanning]);

  // Load welcome screen or current status when the simulated user changes
  useEffect(() => {
    resetChat();
  }, [botSimUser]);

  const resetChat = () => {
    if (!botSimUser) {
      setMessages([
        {
          id: 'msg-init-1',
          sender: 'bot',
          text: 'سلام! به ربات مدیریت اسناد و حضانت پیمانکاری خوش آمدید.\n\nلطفاً از منوی سمت راست یک نمایه کاربری تلگرام انتخاب کنید تا گفتگو شبیه‌سازی شود.',
          timestamp: formatTime()
        }
      ]);
      return;
    }

    const msgs: ChatMessage[] = [];
    msgs.push({
      id: 'msg-welcome-bot',
      sender: 'bot',
      text: `🤖 ربات مدیریت اسناد و CRM فعال شد.\n\n👤 حساب کاربری شبیه‌سازی شده: *${botSimUser.name}*\n📞 شماره تماس: \`${botSimUser.phone_number}\`\n🛡️ سطح نقش: *${botSimUser.role}*`,
      timestamp: formatTime()
    });

    if (botSimUser.telegram_user_id === null) {
      // Unpaired user - Show OTP start prompt
      msgs.push({
        id: 'msg-unpaired',
        sender: 'bot',
        text: '⚠️ هویت تلگرام شما هنوز جفت‌سازی (Pair) نشده است.\n\nبرای دسترسی به اسناد شرکت پیمانکاری، لطفا اطلاعات تماس خود را به اشتراک بگذارید.',
        timestamp: formatTime(),
        buttons: [
          ['📱 ارسال شماره تماس و احراز هویت']
        ]
      });
    } else {
      // Paired - Show main role-based menu
      msgs.push({
        id: 'msg-paired',
        sender: 'bot',
        text: '✅ احراز هویت با موفقیت انجام شده است. منوی خدمات در خدمت شماست:',
        timestamp: formatTime(),
        buttons: getMainKeyboard(botSimUser.role)
      });
    }

    setMessages(msgs);
    setActiveDraft(null);
    setOtpSentCode(null);
  };

  const formatTime = () => {
    const d = new Date();
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  };

  const getMainKeyboard = (role: string) => {
    if (role === 'OWNER') {
      return [
        ['📄 ثبت سند', '🔍 جستجو اسناد'],
        ['📥 دریافت‌های من', '📤 تحویل‌های من'],
        ['📊 خلاصه گزارش ممیزی']
      ];
    } else {
      // USER and ADMIN get standard keys
      return [
        ['📄 ثبت سند', '🔍 جستجو اسناد'],
        ['📥 دریافت‌های من', '📤 تحویل‌های من']
      ];
    }
  };

  // Bot logic parser
  const handleUserMessage = (text: string) => {
    if (!botSimUser) return;

    // Add user message to chat log
    const newUserMsg: ChatMessage = {
      id: 'msg-' + Date.now() + '-u',
      sender: 'user',
      text,
      timestamp: formatTime()
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputText('');

    // Process Bot Response
    setTimeout(() => {
      const respMsgs = processResponseText(text);
      setMessages(prev => [...prev, ...respMsgs]);
    }, 500);
  };

  const processResponseText = (text: string): ChatMessage[] => {
    const msgs: ChatMessage[] = [];
    const nowStr = formatTime();

    // 1. Check if user is unpaired
    if (botSimUser?.telegram_user_id === null) {
      if (text === '📱 ارسال شماره تماس و احراز هویت') {
        // Trigger simulated OTP
        const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
        setOtpSentCode(otpCode);
        setOtpExpiry(Date.now() + 2 * 60 * 1000); // 2 minutes
        setPairingPhone(botSimUser.phone_number);

        msgs.push({
          id: 'msg-otp-sent',
          sender: 'bot',
          text: `🔐 کد تایید احراز هویت ۲ دقیقه‌ای صادر شد!\n\nشماره همراه ارسالی تلگرام با لیست پرسنل پیمانکاری منطبق گردید.\n\n💬 شبیه‌ساز پیامک: *کد احراز هویت شما: ${otpCode}* است.\n\nلطفاً کد تایید ۴ رقمی را وارد نمایید:`,
          timestamp: nowStr,
          buttons: [['❌ انصراف از ثبت‌نام']]
        });
        return msgs;
      }

      if (text === '❌ انصراف از ثبت‌نام') {
        setOtpSentCode(null);
        msgs.push({
          id: 'msg-otp-cancel',
          sender: 'bot',
          text: 'عملیات احراز هویت لغو شد.',
          timestamp: nowStr,
          buttons: [['📱 ارسال شماره تماس و احراز هویت']]
        });
        return msgs;
      }

      // Check if inputting OTP code
      if (otpSentCode) {
        if (text === otpSentCode) {
          if (otpExpiry && Date.now() > otpExpiry) {
            msgs.push({
              id: 'msg-otp-expired',
              sender: 'bot',
              text: '❌ کد تایید منقضی شده است (اعتبار ۲ دقیقه). لطفا مجدداً تلاش کنید.',
              timestamp: nowStr,
              buttons: [['📱 ارسال شماره تماس و احراز هویت']]
            });
            setOtpSentCode(null);
          } else {
            // SUCCESSFUL PAIRING
            const data = DbStore.load();
            const u = data.users.find(usr => usr.id === botSimUser.id);
            if (u) {
              const fakeTelegramId = Math.floor(100000000 + Math.random() * 900000000);
              u.telegram_user_id = fakeTelegramId;
              
              // Add audit log
              DbStore.addAuditLog(tenantId, u.id, 'TELEGRAM_USER_PAIRED', 'User', u.id, {
                phone_number: u.phone_number,
                telegram_user_id: fakeTelegramId
              });
              DbStore.save();
              
              // Mutate prop to trigger state reload
              onSetBotSimUser({ ...u });
              refreshDb();

              msgs.push({
                id: 'msg-otp-success',
                sender: 'bot',
                text: `🎉 هویت تلگرام شما با موفقیت جفت‌سازی شد!\n\nسلام *${u.name}*، خوش آمدید. دسترسی به اسناد با توجه به نقش *${u.role}* برای شما فعال گردید.`,
                timestamp: nowStr,
                buttons: getMainKeyboard(u.role)
              });
            }
            setOtpSentCode(null);
          }
        } else {
          msgs.push({
            id: 'msg-otp-fail',
            sender: 'bot',
            text: '❌ کد تایید اشتباه است. لطفاً مجدداً کد ۴ رقمی ارسالی را وارد نمایید:',
            timestamp: nowStr,
            buttons: [['❌ انصراف از ثبت‌نام']]
          });
        }
        return msgs;
      }

      // Default unpaired instructions
      msgs.push({
        id: 'msg-otp-instruct',
        sender: 'bot',
        text: 'دسترسی محدود است. لطفا با فشردن دکمه زیر اطلاعات تماس خود را جهت جفت‌سازی ایمن تلگرام ارسال کنید.',
        timestamp: nowStr,
        buttons: [['📱 ارسال شماره تماس و احراز هویت']]
      });
      return msgs;
    }

    // --- PAIRED STATE MACHINE LOGIC ---

    // Cancel registration draft
    if (text === '❌ انصراف') {
      setActiveDraft(null);
      msgs.push({
        id: 'msg-reg-cancel',
        sender: 'bot',
        text: 'فرآیند ثبت سند متوقف و پیش‌نویس موقت حذف گردید.',
        timestamp: nowStr,
        buttons: getMainKeyboard(botSimUser.role)
      });
      return msgs;
    }

    // 2. Main keyboard actions
    if (text === '📄 ثبت سند') {
      // Check if user is active
      const data = DbStore.load();
      const dbUser = data.users.find(u => u.id === botSimUser.id);
      if (!dbUser || !dbUser.is_active) {
        msgs.push({
          id: 'msg-lockout',
          sender: 'bot',
          text: '⛔️ حساب کاربری شما توسط مالک سیستم غیرفعال شده است. ربات تمام ارتباطات شما را مسدود کرده است.',
          timestamp: nowStr
        });
        return msgs;
      }

      // Start UC-BOT-001 (Document registration)
      msgs.push({
        id: 'msg-reg-start',
        sender: 'bot',
        text: '📄 *مرحله ۱ از ۸: بارگذاری فایل*\n\nلطفاً فایل اسکن سند کارگاهی (تصویر یا PDF) را آپلود کنید:\n\n_(می‌توانید از کادر زیر برای انتخاب فایل شبیه‌ساز استفاده کنید.)_',
        timestamp: nowStr,
        buttons: [['❌ انصراف']],
        fileUploadSim: true
      });
      
      // Initialize a temporary draft
      setActiveDraft({
        id: 'draft-temp-id',
        tenant_id: tenantId,
        user_id: botSimUser.id,
        scan_file_path: '',
        metadata: {},
        current_step: 'UPLOAD_FILE',
        created_at: new Date().toISOString()
      });
      return msgs;
    }

    if (text === '🔍 جستجو اسناد') {
      msgs.push({
        id: 'msg-search-start',
        sender: 'bot',
        text: '🔍 کلمه کلیدی یا شماره سند مورد نظر را برای جستجو ارسال کنید:',
        timestamp: nowStr,
        buttons: [['🔙 بازگشت']]
      });
      return msgs;
    }

    if (text === '🔙 بازگشت') {
      msgs.push({
        id: 'msg-back-main',
        sender: 'bot',
        text: 'به منوی اصلی بازگشتید:',
        timestamp: nowStr,
        buttons: getMainKeyboard(botSimUser.role)
      });
      return msgs;
    }

    if (text === '📊 خلاصه گزارش ممیزی') {
      const data = DbStore.load();
      const logs = DbStore.getAuditLogs(tenantId);
      const docs = DbStore.getDocuments(tenantId);
      const activeCount = docs.filter(d => d.status === 'ACTIVE').length;
      const voidedCount = docs.filter(d => d.status === 'VOIDED').length;

      msgs.push({
        id: 'msg-report-m',
        sender: 'bot',
        text: `📊 *خلاصه گزارش ممیزی امنیتی مستأجر*\n\n📈 کل اسناد فعال: *${activeCount}*\n📉 اسناد باطل شده: *${voidedCount}*\n🔒 تعداد کل تراکنش‌های ثبت شده در زنجیره بلاک‌چینی: *${logs.length}*\n\n✅ زنجیره حسابرسی امنیتی و ایزولاسیون دیتابیس در حالت پایدار قرار دارد.`,
        timestamp: nowStr,
        buttons: getMainKeyboard(botSimUser.role)
      });
      return msgs;
    }

    // 3. Pending custody transfer queues (📥 دریافت‌های من / 📤 تحویل‌های من)
    if (text === '📥 دریافت‌های من') {
      const transfers = DbStore.getCustodyTransfers(tenantId).filter(
        t => t.receiver_id === botSimUser.id && t.status === 'PENDING'
      );

      if (transfers.length === 0) {
        msgs.push({
          id: 'msg-receives-empty',
          sender: 'bot',
          text: '📥 *صندوق دریافت‌های معلق فیزیکی*\n\nشما هیچ درخواست دریافت معلق ثبت‌نشده‌ای ندارید.',
          timestamp: nowStr,
          buttons: getMainKeyboard(botSimUser.role)
        });
      } else {
        msgs.push({
          id: 'msg-receives-header',
          sender: 'bot',
          text: `📥 *تراکنش‌های حضانت ورودی (${transfers.length} مورد)*\n\nتأیید اصل اسناد کاغذی تحویل شده در کارگاه:`,
          timestamp: nowStr
        });

        // Add inline interaction for each pending transfer
        transfers.forEach(tf => {
          const doc = DbStore.getDocuments(tenantId).find(d => d.id === tf.document_id);
          const sender = DbStore.getUsers(tenantId).find(u => u.id === tf.sender_id);
          
          msgs.push({
            id: `msg-tf-${tf.id}`,
            sender: 'bot',
            text: `📄 *سند:* ${doc?.doc_type || 'متفرقه'} (${doc?.internal_id})\n👤 *فرستنده:* ${sender?.name || 'نامشخص'}\n📅 *وضعیت:* منتظر تایید تحویل فیزیکی به شما`,
            timestamp: nowStr,
            inlineButtons: [
              [
                { text: '✅ تایید دریافت نسخه فیزیکی', callback: `approve_tf_${tf.id}` },
                { text: '❌ رد', callback: `reject_tf_${tf.id}` }
              ]
            ]
          });
        });
      }
      return msgs;
    }

    if (text === '📤 تحویل‌های من') {
      const transfers = DbStore.getCustodyTransfers(tenantId).filter(
        t => t.sender_id === botSimUser.id && t.status === 'PENDING'
      );

      if (transfers.length === 0) {
        msgs.push({
          id: 'msg-deliveries-empty',
          sender: 'bot',
          text: '📤 *صندوق انتقال‌های فیزیکی ارسالی*\n\nشما هیچ انتقال در جریان معلقی ندارید که تایید نشده باشد.',
          timestamp: nowStr,
          buttons: getMainKeyboard(botSimUser.role)
        });
      } else {
        msgs.push({
          id: 'msg-deliveries-header',
          sender: 'bot',
          text: `📤 *انتقال‌های ارسالی معلق (${transfers.length} مورد)*\n\nتا زمانی که گیرنده تایید نکند، شما حق لغو دارید:`,
          timestamp: nowStr
        });

        transfers.forEach(tf => {
          const doc = DbStore.getDocuments(tenantId).find(d => d.id === tf.document_id);
          const receiver = DbStore.getUsers(tenantId).find(u => u.id === tf.receiver_id);

          msgs.push({
            id: `msg-tf-del-${tf.id}`,
            sender: 'bot',
            text: `📄 *سند:* ${doc?.doc_type || 'متفرقه'} (${doc?.internal_id})\n👤 *تحویل به:* ${receiver?.name || 'نامشخص'}\n🔒 *وضعیت:* در انتظار تایید حضانت توسط گیرنده`,
            timestamp: nowStr,
            inlineButtons: [
              [
                { text: '🚫 لغو درخواست انتقال فیزیکی', callback: `cancel_tf_${tf.id}` }
              ]
            ]
          });
        });
      }
      return msgs;
    }

    // 4. Registration Step-by-Step Draft Parser (UC-BOT-001)
    if (activeDraft) {
      const step = activeDraft.current_step;

      if (step === 'SELECT_PROJECT') {
        const foundProj = activeProjects.find(p => p.name === text);
        if (!foundProj && text !== '⏭️ رد شدن') {
          msgs.push({
            id: 'msg-reg-proj-err',
            sender: 'bot',
            text: '❌ پروژه نامعتبر است. لطفا یکی از گزینه‌های دکمه زیر را بفشارید:',
            timestamp: nowStr,
            buttons: [...activeProjects.map(p => [p.name]), ['❌ انصراف']]
          });
          return msgs;
        }

        activeDraft.metadata.project_id = foundProj ? foundProj.id : undefined;
        activeDraft.current_step = 'ENTER_DOC_TYPE';
        setActiveDraft({ ...activeDraft });

        msgs.push({
          id: 'msg-reg-type',
          sender: 'bot',
          text: '📄 *مرحله ۳ از ۸: نوع سند*\n\nنوع سند را بنویسید (مانند: نقشه الکتریکال، صورت‌جلسه کارگاهی، سند تضمین حسن انجام کار):',
          timestamp: nowStr,
          buttons: [['⏭️ رد شدن'], ['❌ انصراف']]
        });
        return msgs;
      }

      if (step === 'ENTER_DOC_TYPE') {
        activeDraft.metadata.doc_type = text !== '⏭️ رد شدن' ? text : undefined;
        activeDraft.current_step = 'ENTER_DOC_NUMBER';
        setActiveDraft({ ...activeDraft });

        msgs.push({
          id: 'msg-reg-num',
          sender: 'bot',
          text: '📄 *مرحله ۴ از ۸: شماره سند فیزیکی*\n\nشماره ثبت کاغذی سند را وارد کنید (یا رد شدن را بزنید):',
          timestamp: nowStr,
          buttons: [['⏭️ رد شدن'], ['❌ انصراف']]
        });
        return msgs;
      }

      if (step === 'ENTER_DOC_NUMBER') {
        activeDraft.metadata.doc_number = text !== '⏭️ رد شدن' ? text : undefined;
        activeDraft.current_step = 'ENTER_DOC_DATE';
        setActiveDraft({ ...activeDraft });

        msgs.push({
          id: 'msg-reg-date',
          sender: 'bot',
          text: '📄 *مرحله ۵ از ۸: تاریخ سند (شمسی)*\n\nتاریخ روی برگه سند را وارد کنید (فرمت نمونه: ۱۴۰۵/۰۵/۰۱):',
          timestamp: nowStr,
          buttons: [['⏭️ رد شدن'], ['❌ انصراف']]
        });
        return msgs;
      }

      if (step === 'ENTER_DOC_DATE') {
        // Simple Hijri format verification
        if (text !== '⏭️ رد شدن' && !text.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
          msgs.push({
            id: 'msg-reg-date-err',
            sender: 'bot',
            text: '❌ فرمت تاریخ نامعتبر است! لطفاً تاریخ را مانند الگوی `۱۴۰۵/۰۵/۰۱` وارد کنید:',
            timestamp: nowStr,
            buttons: [['⏭️ رد شدن'], ['❌ انصراف']]
          });
          return msgs;
        }

        activeDraft.metadata.doc_date = text !== '⏭️ رد شدن' ? text : undefined;
        activeDraft.current_step = 'ENTER_DESCRIPTION';
        setActiveDraft({ ...activeDraft });

        msgs.push({
          id: 'msg-reg-desc',
          sender: 'bot',
          text: '📄 *مرحله ۶ از ۸: توضیحات تکمیلی*\n\nتوضیحات مربوط به محتوای سند یا دستور کار را به اختصار وارد کنید:',
          timestamp: nowStr,
          buttons: [['📝 ثبت بدون توضیحات'], ['❌ انصراف']]
        });
        return msgs;
      }

      if (step === 'ENTER_DESCRIPTION') {
        activeDraft.metadata.description = (text !== '📝 ثبت بدون توضیحات' && text !== '⏭️ رد شدن') ? text : undefined;
        activeDraft.current_step = 'SELECT_CUSTODIAN';
        setActiveDraft({ ...activeDraft });

        // Generate users list buttons
        const userButtons = allUsers.filter(u => u.is_active).map(u => [u.name]);

        msgs.push({
          id: 'msg-reg-cust',
          sender: 'bot',
          text: '📄 *مرحله ۷ از ۸: دارنده فیزیکی سند*\n\nاصل سند کاغذی/فیزیکی هم‌اکنون از نظر فیزیکی در اختیار کیست؟',
          timestamp: nowStr,
          buttons: [...userButtons, ['❌ انصراف']]
        });
        return msgs;
      }

      if (step === 'SELECT_CUSTODIAN') {
        const foundUser = allUsers.find(u => u.name === text && u.is_active);
        if (!foundUser) {
          const userButtons = allUsers.filter(u => u.is_active).map(u => [u.name]);
          msgs.push({
            id: 'msg-reg-cust-err',
            sender: 'bot',
            text: '❌ پرسنل انتخاب شده یافت نشد یا غیرفعال است! لطفاً یکی از افراد زیر را انتخاب کنید:',
            timestamp: nowStr,
            buttons: [...userButtons, ['❌ انصراف']]
          });
          return msgs;
        }

        activeDraft.metadata.physical_custodian_id = foundUser.id;
        activeDraft.current_step = 'CONFIRM_REGISTRATION';
        setActiveDraft({ ...activeDraft });

        const selectedProj = activeProjects.find(p => p.id === activeDraft.metadata.project_id);

        msgs.push({
          id: 'msg-reg-summary',
          sender: 'bot',
          text: `📄 *مرحله ۸ از ۸: بررسی و تأیید نهایی*\n\nخلاصه اطلاعات وارد شده:\n\n📁 فایل دیجیتال: \`${uploadedFileName}\` (${isVirusInfected ? 'آلوده' : 'سالم و اسکن شده'})\n🏢 پروژه: *${selectedProj ? selectedProj.name : 'عمومی / عمومی'}*\n📋 نوع سند: *${activeDraft.metadata.doc_type || 'متفرقه'}*\n🔢 شماره سند: \`${activeDraft.metadata.doc_number || 'بدون شماره'}\`\n📅 تاریخ برگه: *${activeDraft.metadata.doc_date || 'فاقد تاریخ'}*\n📝 توضیحات: _${activeDraft.metadata.description || 'ثبت نشده'}_\n🔑 دارنده فیزیکی اصل برگه: *${foundUser.name}*`,
          timestamp: nowStr,
          inlineButtons: [
            [
              { text: '✅ تأیید نهایی و ثبت سند', callback: 'confirm_reg_final' },
              { text: '❌ انصراف و حذف پیش‌نویس', callback: 'cancel_reg_final' }
            ]
          ]
        });
        return msgs;
      }
    }

    // 5. Default search fallback (if searching is active)
    if (messages[messages.length - 1]?.text?.includes('جستجو اسناد')) {
      const data = DbStore.load();
      const docs = DbStore.getDocuments(tenantId).filter(
        d => d.internal_id.toLowerCase().includes(text.toLowerCase()) ||
             (d.doc_type && d.doc_type.toLowerCase().includes(text.toLowerCase())) ||
             (d.doc_number && d.doc_number.toLowerCase().includes(text.toLowerCase())) ||
             (d.description && d.description.toLowerCase().includes(text.toLowerCase()))
      );

      if (docs.length === 0) {
        msgs.push({
          id: 'msg-search-empty',
          sender: 'bot',
          text: `🔍 هیچ سندی با کلیدواژه "${text}" یافت نشد.`,
          timestamp: nowStr,
          buttons: getMainKeyboard(botSimUser.role)
        });
      } else {
        msgs.push({
          id: 'msg-search-results',
          sender: 'bot',
          text: `🔍 یافت شده (${docs.length} مورد):\n\n` + docs.map(d => `📄 *${d.internal_id}* - ${d.doc_type}\n📅 تاریخ: ${d.doc_date || 'نامشخص'} • حضانت: ${allUsers.find(u => u.id === d.physical_custodian_id)?.name}\n`).join('\n'),
          timestamp: nowStr,
          buttons: getMainKeyboard(botSimUser.role)
        });
      }
      return msgs;
    }

    // Default Fallback
    msgs.push({
      id: 'msg-default',
      sender: 'bot',
      text: 'دستور نامشخص. لطفاً از دکمه‌های منوی گفتگو برای ناوبری استفاده فرمایید.',
      timestamp: nowStr,
      buttons: getMainKeyboard(botSimUser.role)
    });
    return msgs;
  };

  // Drag and drop / File upload simulator (S3 Quarantine scan with ClamAV - PD-005)
  const handleSimulateFileUpload = async (fileName: string, sizeStr: string, infected: boolean) => {
    if (!activeDraft || !botSimUser) return;
    
    setUploadedFileName(fileName);
    setIsVirusInfected(infected);
    setIsScanning(true);

    // Push "File Uploading..." alert in Telegram Chat
    const uploadingMsg: ChatMessage = {
      id: 'msg-uploading',
      sender: 'bot',
      text: `⏳ در حال دریافت فایل دیجیتال \`${fileName}\` (${sizeStr})...\n\n📁 فایل در باکت موقت \`s3://contractor-crm-quarantine\` قرنطینه شد.\n\n🛡️ آنتی‌ویروس ClamAV در حال اسکن بدافزار فایلهای پیوست است...`,
      timestamp: formatTime()
    };
    setMessages(prev => [...prev, uploadingMsg]);

    const result = await DbStore.simulateUploadToS3(
      fileName, 
      `Simulated binary scanner source for ${fileName}`, 
      sizeStr, 
      infected
    );

    setIsScanning(false);

    if (result.success) {
      // Clean file! Move draft step to Project Selection
      activeDraft.scan_file_path = result.quarantine_key; // Saved temporarily
      activeDraft.current_step = 'SELECT_PROJECT';
      setActiveDraft({ ...activeDraft });

      // Add clean response
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'msg-uploading'),
        {
          id: 'msg-scan-clean',
          sender: 'bot',
          text: `✅ اسکن ClamAV تکمیل شد: *فایل سالم است.*\n\n📄 *مرحله ۲ از ۸: پروژه کارگاه*\n\nپروژه مربوط به سند را از گزینه‌های دکمه زیر انتخاب کنید:`,
          timestamp: formatTime(),
          buttons: [...activeProjects.map(p => [p.name]), ['⏭️ رد شدن'], ['❌ انصراف']]
        }
      ]);
    } else {
      // Virus found! Delete draft
      setActiveDraft(null);
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'msg-uploading'),
        {
          id: 'msg-scan-infected',
          sender: 'bot',
          text: `🚨 *تهدید امنیتی شناسایی شد!*\n\nسرویس ClamAV آپلود فایل \`${fileName}\` را به دلیل مغایرت با امضای ویروسی مسدود کرد.\n\n❌ فایل مخرب با موفقیت از باکت قرنطینه پاکسازی گردید و پیش‌نویس موقت ابطال شد.`,
          timestamp: formatTime(),
          buttons: getMainKeyboard(botSimUser.role)
        }
      ]);
    }
    refreshDb();
  };

  // Inline Button callback handler (approving/rejecting handshakes etc)
  const handleCallbackQuery = (callback: string) => {
    if (!botSimUser) return;
    const nowStr = formatTime();

    // 1. Handshake Approve
    if (callback.startsWith('approve_tf_')) {
      const tfId = callback.replace('approve_tf_', '');
      try {
        DbStore.approveCustodyTransfer(tenantId, tfId, botSimUser.id);
        refreshDb();
        setMessages(prev => [
          ...prev,
          {
            id: `msg-callback-ok-${tfId}`,
            sender: 'bot',
            text: `✅ حضانت فیزیکی سند کاغذی با موفقیت پذیرفته شد.\n\nتراکنش با موفقیت به اتمام رسید و در دفتر کل ممیزی زنجیره بلاک‌چین ثبت شد.`,
            timestamp: nowStr,
            buttons: getMainKeyboard(botSimUser.role)
          }
        ]);
      } catch (err: any) {
        alert(err.message);
      }
    }

    // 2. Handshake Reject
    if (callback.startsWith('reject_tf_')) {
      const tfId = callback.replace('reject_tf_', '');
      try {
        DbStore.rejectCustodyTransfer(tenantId, tfId, botSimUser.id);
        refreshDb();
        setMessages(prev => [
          ...prev,
          {
            id: `msg-callback-rej-${tfId}`,
            sender: 'bot',
            text: `❌ تحویل فیزیکی سند رد شد. سند در اختیار فرستنده باقی ماند.`,
            timestamp: nowStr,
            buttons: getMainKeyboard(botSimUser.role)
          }
        ]);
      } catch (err: any) {
        alert(err.message);
      }
    }

    // 3. Cancel transfer
    if (callback.startsWith('cancel_tf_')) {
      const tfId = callback.replace('cancel_tf_', '');
      try {
        DbStore.cancelCustodyTransfer(tenantId, tfId, botSimUser.id);
        refreshDb();
        setMessages(prev => [
          ...prev,
          {
            id: `msg-callback-can-${tfId}`,
            sender: 'bot',
            text: `🚫 انتقال فیزیکی معلق با موفقیت لغو گردید.`,
            timestamp: nowStr,
            buttons: getMainKeyboard(botSimUser.role)
          }
        ]);
      } catch (err: any) {
        alert(err.message);
      }
    }

    // 4. Confirm Registration (UC-BOT-001 confirm)
    if (callback === 'confirm_reg_final') {
      if (!activeDraft) return;
      try {
        // Move file from Quarantine to production bucket
        const productionPath = DbStore.promoteToS3Storage(
          activeDraft.scan_file_path,
          tenantId,
          activeDraft.metadata.project_id || 'no_project',
          'doc_' + Date.now().toString().substring(8)
        );

        // Register document in DB
        const newDoc = DbStore.registerDocument(
          tenantId,
          botSimUser.id,
          activeDraft.metadata.project_id || null,
          activeDraft.metadata.doc_type || 'سند متفرقه کارگاهی',
          activeDraft.metadata.doc_number || '',
          activeDraft.metadata.doc_date || '1405/05/01',
          activeDraft.metadata.description || '',
          activeDraft.metadata.physical_custodian_id || botSimUser.id,
          productionPath
        );

        setActiveDraft(null);
        refreshDb();

        setMessages(prev => [
          ...prev,
          {
            id: 'msg-confirm-reg-ok',
            sender: 'bot',
            text: `🎉 *سند با موفقیت در دیتابیس پیمانکاری ثبت شد!*\n\n🔑 شناسه داخلی صادر شده: *${newDoc.internal_id}*\n📂 فایل دیجیتال به باکت اصلی \`contractor-crm-storage\` منتقل و لاگ ممیزی رمزنگاری شد.\n\nتراکنش با موفقیت به اتمام رسید.`,
            timestamp: nowStr,
            buttons: getMainKeyboard(botSimUser.role)
          }
        ]);
      } catch (err: any) {
        alert(err.message || 'خطا در ثبت سند');
      }
    }

    if (callback === 'cancel_reg_final') {
      setActiveDraft(null);
      setMessages(prev => [
        ...prev,
        {
          id: 'msg-confirm-reg-no',
          sender: 'bot',
          text: 'عملیات ثبت لغو شد و پیش‌نویس موقت با TTL منقضی شد.',
          timestamp: nowStr,
          buttons: getMainKeyboard(botSimUser.role)
        }
      ]);
    }
  };

  return (
    <div className="rtl grid grid-cols-1 lg:grid-cols-3 gap-6 text-slate-800">
      
      {/* Simulation Controls Sidebar */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <Smartphone className="w-5 h-5 text-indigo-600" />
            <span>تنظیمات شبیه‌ساز تلگرام</span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">شبیه‌سازی حساب کاربری تلگرام</label>
              <select
                value={botSimUser ? botSimUser.id : ''}
                onChange={(e) => {
                  const u = allUsers.find(usr => usr.id === e.target.value);
                  if (u) onSetBotSimUser(u);
                }}
                className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none"
              >
                <option value="">انتخاب حساب کاربری...</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role}) {u.telegram_user_id === null ? '⚠️ غیر جفت‌سازی' : '✓ جفت‌سازی'}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                برای تست فرآیند احراز هویت پیامکی، حسابی را انتخاب کنید که وضعیت آن "غیر جفت‌سازی" است.
              </p>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] text-slate-600 space-y-1.5">
              <span className="font-bold text-slate-700 block">دستورالعمل تست ربات:</span>
              <ul className="list-disc list-inside space-y-1 pr-1">
                <li>دکمه <span className="font-medium">ثبت سند</span> را زده و فایلی با شبیه‌ساز بارگذاری کنید.</li>
                <li>برای فرآیند حضانت، در این بخش برگه <span className="font-medium">دریافت‌های من</span> را باز کنید تا Handshake های فیزیکی را تایید کنید.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Mobile Chat Frame (2 cols) */}
      <div className="lg:col-span-2 flex justify-center">
        <div className="w-full max-w-sm bg-slate-950 p-4 pb-8 rounded-[40px] shadow-2xl border-[10px] border-slate-900 relative">
          
          {/* Mobile Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-slate-900 w-32 h-4 rounded-b-xl z-20 flex items-center justify-center">
            <span className="w-10 h-1 bg-slate-800 rounded-full"></span>
          </div>

          {/* Chat Application Header */}
          <div className="bg-slate-900 text-white pt-5 pb-3 px-3 rounded-t-2xl flex items-center gap-2 border-b border-slate-800">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0">
              <Bot className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold flex items-center gap-1">
                <span>ربات اسناد پیمانکاری</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </h4>
              <p className="text-[9px] text-slate-400">امضا دیجیتال و زنجیره حضانت فیزیکی</p>
            </div>
            <button 
              onClick={resetChat} 
              className="mr-auto text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
              title="بارگذاری مجدد گفتگو"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages Body container */}
          <div className="h-[400px] overflow-y-auto bg-slate-900 p-3 space-y-3 scroll-smooth text-xs">
            {messages.map(msg => (
              <div 
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl p-2.5 shadow-xs whitespace-pre-line ${
                    msg.sender === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/50'
                  }`}
                >
                  {msg.text}

                  {/* Attachment Simulator inline (PD-005) */}
                  {msg.fileUploadSim && activeDraft && (
                    <div className="mt-3 bg-slate-900/80 p-3 rounded-lg border border-indigo-500/30 text-xs">
                      <div className="text-[10px] font-bold text-indigo-400 mb-2 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        <span>شبیه‌ساز بارگذاری فایل سند دیجیتال (S3)</span>
                      </div>
                      
                      <div className="space-y-1.5">
                        <button 
                          onClick={() => handleSimulateFileUpload('map_shope_faze2.pdf', '4.2 MB', false)}
                          disabled={isScanning}
                          className="w-full text-right p-1.5 bg-slate-800 hover:bg-slate-750 text-[10px] text-indigo-200 hover:text-white rounded border border-indigo-950 flex items-center justify-between font-mono"
                        >
                          <span>📄 map_shope_faze2.pdf (سالم)</span>
                          <span className="text-[9px] bg-indigo-900/50 text-indigo-300 px-1 py-0.2 rounded font-sans">تایید ClamAV</span>
                        </button>
                        
                        <button 
                          onClick={() => handleSimulateFileUpload('malicious_executable_contract.zip', '18.4 MB', true)}
                          disabled={isScanning}
                          className="w-full text-right p-1.5 bg-slate-800 hover:bg-slate-750 text-[10px] text-rose-300 hover:text-rose-100 rounded border border-rose-950 flex items-center justify-between font-mono"
                        >
                          <span>⚠️ script_infected.exe (مخرب)</span>
                          <span className="text-[9px] bg-rose-950/50 text-rose-300 px-1 py-0.2 rounded font-sans">کشف بدافزار</span>
                        </button>
                      </div>

                      <p className="text-[9px] text-slate-500 mt-2 leading-normal">
                        با انتخاب یکی از فایلهای پیوست بالا، فرآیند آپلود موقت در قرنطینه S3 و اسکن آنتی‌ویروس ClamAV بلافاصله شبیه‌سازی خواهد شد.
                      </p>
                    </div>
                  )}

                  {/* Inline callback buttons (PD-004) */}
                  {msg.inlineButtons && (
                    <div className="mt-2.5 space-y-1">
                      {msg.inlineButtons.map((row, rIdx) => (
                        <div key={rIdx} className="flex gap-1 flex-wrap">
                          {row.map((btn, bIdx) => (
                            <button
                              key={bIdx}
                              onClick={() => handleCallbackQuery(btn.callback)}
                              className="flex-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 hover:text-white text-[10px] font-semibold py-1.5 px-2 rounded-lg border border-indigo-800 transition-colors text-center"
                            >
                              {btn.text}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <span className="text-[9px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
              </div>
            ))}

            {/* Scanning indicator */}
            {isScanning && (
              <div className="flex items-center gap-2 text-slate-400 text-[11px] animate-pulse">
                <Bot className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>در حال تحلیل امنیتی فایل دیجیتال...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Keyboard input bar / Reply Keyboard display */}
          <div className="bg-slate-900 p-2.5 rounded-b-2xl border-t border-slate-800 space-y-2">
            
            {/* REPLY KEYBOARD BUTTONS DISPLAY (PD-004 reply keyboards) */}
            {messages.length > 0 && messages[messages.length - 1]?.buttons && (
              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 grid gap-1">
                {messages[messages.length - 1].buttons?.map((row, rIdx) => (
                  <div key={rIdx} className="flex gap-1 w-full">
                    {row.map((btn, bIdx) => (
                      <button
                        key={bIdx}
                        onClick={() => handleUserMessage(btn)}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[10px] font-semibold py-2 px-1 rounded-lg text-center transition-colors truncate"
                      >
                        {btn}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Custom text sender bar */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (inputText.trim()) handleUserMessage(inputText.trim());
              }}
              className="flex gap-1.5"
            >
              <input 
                type="text"
                placeholder={botSimUser ? "پیامی بنویسید..." : "ابتدا یک پرسنل فعال انتخاب کنید..."}
                disabled={!botSimUser}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-slate-950 text-slate-200 px-3 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 text-xs placeholder:text-slate-600"
              />
              <button 
                type="submit"
                disabled={!botSimUser || !inputText.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 text-white p-2 rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>
      </div>

    </div>
  );
}
