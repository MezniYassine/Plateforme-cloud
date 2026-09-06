import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService, ChatMessageItem } from '../../services/chat.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-ai-chat-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-chat-view.component.html',
  styleUrl: './ai-chat-view.component.scss',
})
export class AiChatViewComponent implements OnInit, AfterViewChecked {
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  private chatService = inject(ChatService);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private base = environment.apiBaseUrl.replace(/\/$/, '');
  private shouldScroll = false;

  userName = signal<string>('');
  isAdmin = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  inputText = signal<string>('');
  messages = signal<ChatMessageItem[]>([]);

  clientSuggestions = [
    {
      title: 'Conseils Architecture',
      desc: 'Recommandation du pack selon votre besoin applicatif.',
      prompt: 'Je prépare une nouvelle application. Quel pack ou catalogue Dynamix me conseilles-tu selon mes besoins et mon budget ?',
    },
    {
      title: 'Mes Machines & Statut',
      desc: 'Vérifier la charge, les IP et l’état de mes instances actives.',
      prompt: 'Peux-tu me faire un résumé complet de mes machines et services actifs avec leurs coûts et adresses IP ?',
    },
    {
      title: 'Optimisation des Coûts',
      desc: 'Analyse du solde en Dinars Tunisiens et prévisions.',
      prompt: 'Quel est mon solde de portefeuille actuel et comment puis-je optimiser mes dépenses cloud en DT ?',
    },
    {
      title: 'Support & Escalade',
      desc: 'Marche à suivre pour ouvrir un ticket auprès des admins.',
      prompt: 'Comment fonctionne l’ouverture d’un ticket de support officiel si je rencontre une panne matérielle ou réseau ?',
    },
  ];

  adminSuggestions = [
    {
      title: 'Stockage Machine DBaaS',
      desc: 'Consulter l’espace restant et le disque sur la machine centrale DBaaS.',
      prompt: 'Quel est le stockage restant et l’état du disque sur la machine DBaaS (192.168.8.183) ?',
    },
    {
      title: 'Supervision Serveur ESXi',
      desc: 'Métrologie CPU, RAM, Datastore et statut des VMs clientes.',
      prompt: 'Peux-tu me donner l’état du serveur ESXi (CPU, RAM, Datastore) et le nombre de VMs actives ?',
    },
    {
      title: 'Workloads PaaS & SaaS',
      desc: 'Nombre de bases de données et d’applications SaaS en production.',
      prompt: 'Combien de conteneurs de bases de données (PaaS) et services SaaS tournent actuellement dans le système ?',
    },
    {
      title: 'Logs & Incidents Critiques',
      desc: 'Diagnostic des alertes non résolues et état de santé de l’infrastructure.',
      prompt: 'Y a-t-il des incidents critiques ou des alertes non résolues récemment dans le système ?',
    },
  ];

  currentSuggestions = computed(() => (this.isAdmin() ? this.adminSuggestions : this.clientSuggestions));

  headerSubtitle = computed(() =>
    this.isAdmin()
      ? "Supervision de l'infrastructure, métrologie des serveurs (ESXi & DBaaS), surveillance des locataires et diagnostic système."
      : "Conseils d'architecture, analyse de vos instances en cours et optimisation de vos coûts en Dinars Tunisiens (DT)."
  );

  inputPlaceholder = computed(() =>
    this.isAdmin()
      ? "Posez une question sur l'infrastructure (ex: Quel est le stockage restant pour la machine DBaaS ?)..."
      : "Posez votre question à Dynamix AI (ex: Quel pack me conseilles-tu pour héberger PostgreSQL ?)..."
  );

  disclaimerText = computed(() =>
    this.isAdmin()
      ? "Assistant d'administration et de supervision système connecté en temps réel à l'infrastructure Dynamix Cloud."
      : "Assistant Cloud intelligent connecté en direct. Pour les pannes physiques ou litiges, veuillez ouvrir un Ticket de Support."
  );

  ngOnInit() {
    this.loadUserData();
  }

  loadUserData() {
    this.http.get<any>(`${this.base}/users/me`).subscribe({
      next: (user) => {
        const prenom = (user?.prenom || '').trim();
        const nom = (user?.nom || '').trim();
        const fullName = `${prenom} ${nom}`.trim() || user?.email || '';
        this.userName.set(fullName);
        if (user?.role === 'GLOBAL_ADMIN' || user?.role === 'ADMIN_GLOBAL') {
          this.isAdmin.set(true);
        }
        this.initWelcomeMessage(fullName);
      },
      error: () => {
        // Fallback pour compte Administrateur Global
        this.http.get<any>(`${this.base}/admin/me`).subscribe({
          next: (admin) => {
            const prenom = (admin?.prenom || '').trim();
            const nom = (admin?.nom || '').trim();
            const fullName = `${prenom} ${nom}`.trim() || admin?.email || '';
            this.isAdmin.set(true);
            this.userName.set(fullName);
            this.initWelcomeMessage(fullName);
          },
          error: () => {
            this.initWelcomeMessage('');
          },
        });
      },
    });
  }

  private initWelcomeMessage(name: string) {
    let greeting = '';
    if (this.isAdmin()) {
      greeting = name
        ? `Bonjour ${name} ! Je suis Dynamix AI Assistant, votre assistant d'administration et de métrologie système. Comment puis-je vous aider aujourd'hui ?`
        : `Bonjour ! Je suis Dynamix AI Assistant, votre assistant d'administration et de métrologie système. Comment puis-je vous aider aujourd'hui ?`;
    } else {
      greeting = name
        ? `Bonjour ${name}, comment puis-je vous aider aujourd'hui ?`
        : `Bonjour, comment puis-je vous aider aujourd'hui ?`;
    }

    this.messages.set([
      {
        id: 'welcome-init',
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      },
    ]);
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  selectSuggestion(prompt: string) {
    this.sendMessage(prompt);
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(overrideText?: string) {
    const textToSend = (overrideText !== undefined ? overrideText : this.inputText()).trim();
    if (!textToSend || this.isLoading()) return;

    const userMessage: ChatMessageItem = {
      id: 'msg-' + Date.now() + '-user',
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    this.messages.update((list) => [...list, userMessage]);
    this.inputText.set('');
    this.isLoading.set(true);
    this.shouldScroll = true;

    const historyPayload = this.messages()
      .filter((m) => !m.id.startsWith('welcome'))
      .slice(-8)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    this.chatService.sendMessage(textToSend, historyPayload).subscribe({
      next: (res) => {
        const assistantMessage: ChatMessageItem = {
          id: 'msg-' + Date.now() + '-assistant',
          role: 'assistant',
          content: res.reply,
          timestamp: res.timestamp ? new Date(res.timestamp) : new Date(),
        };

        this.messages.update((list) => [...list, assistantMessage]);
        this.isLoading.set(false);
        this.shouldScroll = true;
      },
      error: (err) => {
        console.error('Erreur Chat AI:', err);
        const errorMessage: ChatMessageItem = {
          id: 'msg-' + Date.now() + '-error',
          role: 'assistant',
          content: "Désolé, une erreur de communication est survenue avec le moteur IA. Veuillez réessayer dans un instant.",
          timestamp: new Date(),
        };
        this.messages.update((list) => [...list, errorMessage]);
        this.isLoading.set(false);
        this.shouldScroll = true;
      },
    });
  }

  clearChat() {
    this.initWelcomeMessage(this.userName());
  }

  private scrollToBottom() {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch {
      // scroll safely
    }
  }

  formatMarkdown(raw: string): SafeHtml {
    if (!raw) return '';

    let text = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
      return `<pre class="chat-code-block"><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

    // Bold
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Bullet points
    text = text.replace(/^[•\-\*]\s+(.*)$/gm, '<li class="chat-list-item">$1</li>');
    text = text.replace(/(<li class="chat-list-item">.*<\/li>\s*)+/g, '<ul class="chat-list">$&</ul>');

    // Line breaks
    text = text.replace(/\n\n+/g, '<div class="chat-p-gap"></div>');
    text = text.replace(/\n/g, '<br/>');

    text = text.replace(/<pre class="chat-code-block"><code>([\s\S]*?)<\/code><\/pre>/g, (_m, inner) => {
      return `<pre class="chat-code-block"><code>${inner.replace(/<br\/>/g, '\n')}</code></pre>`;
    });
    text = text.replace(/<ul class="chat-list">([\s\S]*?)<\/ul>/g, (_m, inner) => {
      return `<ul class="chat-list">${inner.replace(/<br\/>/g, '')}</ul>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(text);
  }

  formatTime(date: Date): string {
    if (!date) return '';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
