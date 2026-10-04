import { useState, type FormEvent } from 'react'
import { CloudUploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LIMITE_CREDITO } from '@/lib/mock-server'
import { moeda, PRODUTOS, unitarioDe } from '@/lib/pedidos'
import type { PedidoInput } from '@/lib/types'

type Erros = {
  cliente?: string
  quantidade?: string
  unitario?: string
}

type Props = {
  inicial?: PedidoInput
  rotulo: string
  onSubmit: (dados: PedidoInput) => void
  onCancel?: () => void
}

export function PedidoForm({ inicial, rotulo, onSubmit, onCancel }: Props) {
  const [cliente, setCliente] = useState(inicial?.cliente ?? '')
  const [produto, setProduto] = useState(inicial?.produto ?? PRODUTOS[0].nome)
  const [quantidade, setQuantidade] = useState(String(inicial?.quantidade ?? 1))
  const [unitario, setUnitario] = useState(String(inicial?.unitario ?? PRODUTOS[0].unitario))
  const [observacao, setObservacao] = useState(inicial?.observacao ?? '')
  const [erros, setErros] = useState<Erros>({})

  const qtd = Number(quantidade)
  const valor = Number(unitario)
  const total = (Number.isFinite(qtd) ? qtd : 0) * (Number.isFinite(valor) ? valor : 0)
  const acimaDoLimite = total > LIMITE_CREDITO

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const proximos: Erros = {}
    if (!cliente.trim()) proximos.cliente = 'Informe o cliente'
    if (!Number.isFinite(qtd) || qtd < 1) proximos.quantidade = 'Mínimo de 1 unidade'
    if (!Number.isFinite(valor) || valor <= 0) proximos.unitario = 'Valor inválido'

    setErros(proximos)
    if (Object.keys(proximos).length > 0) return

    onSubmit({
      cliente: cliente.trim(),
      produto,
      quantidade: qtd,
      unitario: valor,
      total,
      observacao: observacao.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <FieldGroup>
        <Field data-invalid={!!erros.cliente}>
          <FieldLabel htmlFor="cliente">Cliente</FieldLabel>
          <Input
            id="cliente"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            aria-invalid={!!erros.cliente}
            placeholder="Ex.: Padaria Estrela"
            autoComplete="off"
          />
          <FieldError>{erros.cliente}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="produto">Produto</FieldLabel>
          <Select
            value={produto}
            onValueChange={(v) => {
              setProduto(v)
              setUnitario(String(unitarioDe(v)))
            }}
          >
            <SelectTrigger id="produto" className="w-full">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PRODUTOS.map((p) => (
                  <SelectItem key={p.nome} value={p.nome}>
                    {p.nome} · {moeda(p.unitario)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!erros.quantidade}>
            <FieldLabel htmlFor="quantidade">Quantidade</FieldLabel>
            <Input
              id="quantidade"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              aria-invalid={!!erros.quantidade}
            />
            <FieldError>{erros.quantidade}</FieldError>
          </Field>

          <Field data-invalid={!!erros.unitario}>
            <FieldLabel htmlFor="unitario">Valor unitário</FieldLabel>
            <Input
              id="unitario"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={unitario}
              onChange={(e) => setUnitario(e.target.value)}
              aria-invalid={!!erros.unitario}
            />
            <FieldError>{erros.unitario}</FieldError>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="observacao">Observação</FieldLabel>
          <Textarea
            id="observacao"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Opcional: prazo de entrega, contato, etc."
            rows={2}
          />
          <FieldDescription>
            A escrita acontece primeiro no dispositivo — a rede é apenas o próximo passo.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
          <span className="text-xs text-muted-foreground">Total do pedido</span>
          <span className="text-sm font-semibold tabular-nums">{moeda(total)}</span>
        </div>

        {acimaDoLimite && (
          <p className="text-xs text-destructive">
            Acima do limite de crédito — o servidor vai rejeitar com 422 (falha permanente).
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit">
            <CloudUploadIcon data-icon="inline-start" />
            {rotulo}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
